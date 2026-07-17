/// 欄目管理服務
use crate::model::{ContentSort, ContentSortNode};
use crate::util::response::{self, Meta};
use worker::{D1Database, Response};

/// 獲取欄目列表(平鋪)
pub async fn list_sorts(db: &D1Database, status: Option<&str>) -> worker::Result<Vec<ContentSort>> {
    let sql = if status.is_some() {
        "SELECT * FROM ay_content_sort WHERE acode = ? AND status = ? ORDER BY sorting ASC, id ASC"
    } else {
        "SELECT * FROM ay_content_sort WHERE acode = ? ORDER BY sorting ASC, id ASC"
    };

    let stmt = if status.is_some() {
        db.prepare(sql).bind(&["cn", status.unwrap()])?
    } else {
        db.prepare(sql).bind(&["cn"])?
    };

    let result = stmt.all().await?;
    result.results()
}

/// 構建欄目樹(內存遞歸)
pub fn build_sort_tree(sorts: &[ContentSort], parent_code: &str) -> Vec<ContentSortNode> {
    sorts
        .iter()
        .filter(|s| s.pcode == parent_code)
        .map(|s| {
            let children = build_sort_tree(sorts, &s.scode);
            ContentSortNode {
                sort: s.clone(),
                children,
            }
        })
        .collect()
}

/// 獲取欄目樹 API
pub async fn handle_sort_tree(db: &D1Database) -> worker::Result<Response> {
    let sorts = list_sorts(db, Some("1")).await?;
    let tree = build_sort_tree(&sorts, "0");
    response::ok_data(tree, "成功")
}

/// 獲取欄目導航樹(公開接口)
pub async fn handle_nav(db: &D1Database) -> worker::Result<Response> {
    let sorts = list_sorts(db, Some("1")).await?;
    let tree = build_sort_tree(&sorts, "0");
    response::ok_data(tree, "成功")
}

/// 獲取單個欄目詳情
pub async fn handle_sort_detail(
    db: &D1Database,
    scode: &str,
) -> worker::Result<Response> {
    // 支持按 scode / filename / urlname 查詢
    let stmt = db
        .prepare(
            "SELECT * FROM ay_content_sort WHERE acode = ? AND status = '1' AND (scode = ? OR filename = ? OR urlname = ?) LIMIT 1",
        )
        .bind(&["cn", scode, scode, scode])?;

    let result: Option<ContentSort> = stmt.first().await?;
    match result {
        Some(sort) => response::ok_data(sort, "成功"),
        None => response::not_found("欄目不存在"),
    }
}

/// 新增欄目
pub async fn handle_create_sort(
    db: &D1Database,
    body: serde_json::Value,
) -> worker::Result<Response> {
    let name = body
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| worker::Error::RustError("缺少 name 參數".to_string()))?;

    let pcode = body
        .get("pcode")
        .and_then(|v| v.as_str())
        .unwrap_or("0");

    let mcode = body
        .get("mcode")
        .and_then(|v| v.as_str())
        .unwrap_or("2");

    let scode = body
        .get("scode")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let stmt = db
        .prepare(
            "INSERT INTO ay_content_sort (acode, mcode, pcode, scode, name, sorting, status, gtype, gid, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, '1', '4', '', ?, ?)",
        )
        .bind(&[
            "cn",
            mcode,
            pcode,
            scode,
            name,
            "255",
            &now,
            &now,
        ])?;

    let result = stmt.run().await?;

    if result.changes() > 0 {
        response::ok("欄目創建成功")
    } else {
        response::err("欄目創建失敗", 1005)
    }
}

/// 遞歸 CTE 查詢子孫欄目 scode
pub async fn get_descendant_scodes(db: &D1Database, scode: &str) -> worker::Result<Vec<String>> {
    let sql = r#"
        WITH RECURSIVE descendants AS (
            SELECT scode FROM ay_content_sort WHERE scode = ? AND acode = 'cn' AND status = '1'
            UNION ALL
            SELECT s.scode FROM ay_content_sort s
            INNER JOIN descendants d ON s.pcode = d.scode
            WHERE s.acode = 'cn' AND s.status = '1'
        )
        SELECT scode FROM descendants
    "#;

    let stmt = db.prepare(sql).bind(&[scode])?;
    let result = stmt.all().await?;
    let rows: Vec<serde_json::Value> = result.results()?;

    Ok(rows
        .into_iter()
        .filter_map(|r| r.get("scode").and_then(|v| v.as_str().map(|s| s.to_string())))
        .collect())
}

/// 修改欄目
pub async fn handle_update_sort(
    db: &D1Database,
    id: i64,
    body: serde_json::Value,
) -> worker::Result<Response> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 動態構建 UPDATE 語句(白名單字段)
    let allowed_fields = [
        "name", "subname", "mcode", "pcode", "scode", "listtpl", "contenttpl",
        "ico", "pic", "title", "keywords", "description", "filename",
        "sorting", "status", "outlink", "def1", "def2", "def3", "urlname",
    ];

    let mut sets = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    for field in &allowed_fields {
        if let Some(val) = body.get(*field).and_then(|v| v.as_str()) {
            sets.push(format!("{} = ?", field));
            binds.push(val.to_string());
        }
    }

    if sets.is_empty() {
        return response::err("沒有需要更新的字段", 1001);
    }

    sets.push("update_time = ?".to_string());
    binds.push(now);
    binds.push(id.to_string());

    let sql = format!("UPDATE ay_content_sort SET {} WHERE id = ?", sets.join(", "));
    let binds_ref: Vec<&str> = binds.iter().map(|s| s.as_str()).collect();

    db.prepare(&sql).bind(&binds_ref)?.run().await?;

    response::ok("欄目更新成功")
}

/// 刪除欄目
pub async fn handle_delete_sort(db: &D1Database, id: i64) -> worker::Result<Response> {
    db.prepare("DELETE FROM ay_content_sort WHERE id = ?")
        .bind(&[id])?
        .run()
        .await?;

    response::ok("欄目刪除成功")
}
