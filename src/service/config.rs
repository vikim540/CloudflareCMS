/// 配置服務 - KV 緩存 + D1 回退
use crate::model::Config;
use crate::util::response;
use std::collections::HashMap;
use worker::{kv::KvStore, D1Database, Response};

const CONFIG_CACHE_KEY: &str = "config:all";

/// 從 KV 緩存讀取配置,未命中時回退 D1 查詢後寫入 KV
pub async fn get_all_configs(
    db: &D1Database,
    kv: &KvStore,
) -> worker::Result<HashMap<String, String>> {
    // 先嘗試從 KV 讀取
    if let Some(cached) = kv.get(CONFIG_CACHE_KEY).text().await? {
        if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&cached) {
            return Ok(map);
        }
    }

    // KV 未命中,查詢 D1
    let stmt = db.prepare("SELECT name, value FROM ay_config");
    let result = stmt.all().await?;
    let rows: Vec<Config> = result.results()?;

    let mut map = HashMap::new();
    for row in rows {
        map.insert(row.name, row.value);
    }

    // 寫入 KV 緩存
    if let Ok(json) = serde_json::to_string(&map) {
        let _ = kv.put(CONFIG_CACHE_KEY, json)?.execute().await;
    }

    Ok(map)
}

/// 獲取單個配置項
pub async fn get_config(
    db: &D1Database,
    kv: &KvStore,
    name: &str,
    default: &str,
) -> worker::Result<String> {
    let configs = get_all_configs(db, kv).await?;
    Ok(configs.get(name).cloned().unwrap_or_else(|| default.to_string()))
}

/// 清除配置緩存
pub async fn clear_config_cache(kv: &KvStore) -> worker::Result<()> {
    kv.delete(CONFIG_CACHE_KEY).await?;
    Ok(())
}

/// 獲取站點信息
pub async fn get_site_info(db: &D1Database) -> worker::Result<Option<crate::model::Site>> {
    let stmt = db.prepare("SELECT * FROM ay_site WHERE acode = ? LIMIT 1");
    let result = stmt.bind(&["cn"])?.first().await?;
    Ok(result)
}

/// 獲取所有配置(API 響應)
pub async fn handle_list_configs(
    db: &D1Database,
    kv: &KvStore,
) -> worker::Result<Response> {
    let configs = get_all_configs(db, kv).await?;
    let list: Vec<Config> = db
        .prepare("SELECT * FROM ay_config ORDER BY sorting ASC")
        .all()
        .await?
        .results()?;

    response::ok_data(list, "成功")
}

/// 修改配置
pub async fn handle_update_config(
    db: &D1Database,
    kv: &KvStore,
    body: serde_json::Value,
) -> worker::Result<Response> {
    let configs = body
        .get("configs")
        .and_then(|v| v.as_array())
        .ok_or_else(|| worker::Error::RustError("缺少 configs 參數".to_string()))?;

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    for item in configs {
        if let (Some(name), Some(value)) =
            (item.get("name").and_then(|v| v.as_str()), item.get("value").and_then(|v| v.as_str()))
        {
            db.prepare("UPDATE ay_config SET value = ? WHERE name = ?")
                .bind(&[value, name])?
                .run()
                .await?;
        }
    }

    // 清除配置緩存
    clear_config_cache(kv).await?;

    response::ok("配置更新成功")
}
