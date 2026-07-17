/// 內容管理服務
use crate::model::Content;
use crate::service::sort::get_descendant_scodes;
use crate::util::response::{self, Meta};
use crate::util::paginate::Pagination;
use worker::{D1Database, Response};

/// 內容列表查詢(公開接口)
pub async fn list_contents_public(
    db: &D1Database,
    scode: &str,
    keyword: &str,
    page: u32,
    pagesize: u32,
    istop: Option<&str>,
    isrecommend: Option<&str>,
    order: &str,
) -> worker::Result<(Vec<Content>, u32)> {
    let mut conditions = vec!["c.acode = ?".to_string(), "c.status = '1'".to_string()];
    let mut binds: Vec<String> = vec!["cn".to_string()];

    // 欄目篩選(含子孫欄目)
    if !scode.is_empty() {
        let scodes = get_descendant_scodes(db, scode).await?;
        if scodes.is_empty() {
            return Ok((vec![], 0));
        }
        let placeholders = scodes.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        conditions.push(format!("c.scode IN ({})", placeholders));
        for s in scodes {
            binds.push(s);
        }
    }

    // 關鍵詞搜索
    if !keyword.is_empty() {
        conditions.push("(c.title LIKE ? OR c.tags LIKE ?)".to_string());
        let kw = format!("%{}%", keyword);
        binds.push(kw.clone());
        binds.push(kw);
    }

    // 置頂篩選
    if let Some(top) = istop {
        conditions.push("c.istop = ?".to_string());
        binds.push(top.to_string());
    }

    // 推薦篩選
    if let Some(rec) = isrecommend {
        conditions.push("c.isrecommend = ?".to_string());
        binds.push(rec.to_string());
    }

    // 排序
    let order_clause = match order {
        "visits" => "c.visits DESC, c.id DESC",
        "sorting" => "c.sorting ASC, c.id DESC",
        _ => "c.date DESC, c.id DESC",
    };

    let where_clause = conditions.join(" AND ");
    let offset = (page - 1) * pagesize;

    // 查詢列表
    let list_sql = format!(
        "SELECT c.* FROM ay_content c WHERE {} ORDER BY {} LIMIT ? OFFSET ?",
        where_clause, order_clause
    );

    let mut all_binds: Vec<String> = binds.clone();
    all_binds.push(pagesize.to_string());
    all_binds.push(offset.to_string());

    let binds_ref: Vec<&str> = all_binds.iter().map(|s| s.as_str()).collect();
    let stmt = db.prepare(&list_sql).bind(&binds_ref)?;
    let result = stmt.all().await?;
    let list: Vec<Content> = result.results()?;

    // 查詢總數
    let count_sql = format!("SELECT COUNT(*) as total FROM ay_content c WHERE {}", where_clause);
    let count_binds_ref: Vec<&str> = binds.iter().map(|s| s.as_str()).collect();
    let count_stmt = db.prepare(&count_sql).bind(&count_binds_ref)?;
    let count_result = count_stmt.first::<serde_json::Value>(None).await?;
    let total = count_result
        .and_then(|v| v.get("total").and_then(|t| t.as_i64()))
        .unwrap_or(0) as u32;

    Ok((list, total))
}

/// 公開內容列表 API
pub async fn handle_list_contents(
    db: &D1Database,
    query: &worker::QueryMap,
) -> worker::Result<Response> {
    let pagination = Pagination::from_query(query);
    let scode = query.get("scode").unwrap_or("");
    let keyword = query.get("keyword").unwrap_or("");
    let istop = query.get("istop");
    let isrecommend = query.get("isrecommend");
    let order = query.get("order").unwrap_or("date");

    let (list, total) = list_contents_public(
        db, scode, keyword, pagination.page, pagination.pagesize, istop, isrecommend, order,
    )
    .await?;

    let meta = Meta::new(pagination.page, pagination.pagesize, total);
    response::ok_list(list, meta, "成功")
}

/// 內容詳情(公開接口)
pub async fn handle_content_detail(
    db: &D1Database,
    id: i64,
    track: bool,
) -> worker::Result<Response> {
    let stmt = db
        .prepare("SELECT * FROM ay_content WHERE id = ? AND acode = 'cn' AND status = '1'")
        .bind(&[id])?;

    let result: Option<Content> = stmt.first().await?;
    match result {
        Some(mut content) => {
            // 累加訪問量(原始 SQL,不觸發緩存失效)
            if track {
                let _ = db
                    .prepare("UPDATE ay_content SET visits = visits + 1 WHERE id = ?")
                    .bind(&[id])?
                    .run()
                    .await;
                content.visits += 1;
            }

            // 查詢上一篇/下一篇
            let prev = get_adjacent_content(db, id, "prev").await?;
            let next = get_adjacent_content(db, id, "next").await?;

            let data = serde_json::json!({
                "content": content,
                "prev": prev,
                "next": next,
            });

            response::ok_data(data, "成功")
        }
        None => response::not_found("內容不存在"),
    }
}

/// 獲取上一篇/下一篇
async fn get_adjacent_content(
    db: &D1Database,
    id: i64,
    direction: &str,
) -> worker::Result<Option<serde_json::Value>> {
    let sql = if direction == "prev" {
        "SELECT id, title, filename, date FROM ay_content WHERE id < ? AND acode = 'cn' AND status = '1' ORDER BY id DESC LIMIT 1"
    } else {
        "SELECT id, title, filename, date FROM ay_content WHERE id > ? AND acode = 'cn' AND status = '1' ORDER BY id ASC LIMIT 1"
    };

    let stmt = db.prepare(sql).bind(&[id])?;
    stmt.first().await
}

/// 後台內容列表(含草稿和回收站)
pub async fn handle_admin_list_contents(
    db: &D1Database,
    query: &worker::QueryMap,
) -> worker::Result<Response> {
    let pagination = Pagination::from_query(query);
    let scode = query.get("scode").unwrap_or("");
    let keyword = query.get("keyword").unwrap_or("");
    let status = query.get("status").unwrap_or("1");

    let offset = (pagination.page - 1) * pagination.pagesize;

    let mut conditions = vec!["acode = ?".to_string()];
    let mut binds: Vec<String> = vec!["cn".to_string()];

    // 狀態篩選: status >= 0 含草稿, status = -1 回收站
    match status {
        "all" => { conditions.push("status >= '0'".to_string()); }
        "trash" => { conditions.push("status = '-1'".to_string()); }
        _ => { conditions.push("status = ?".to_string()); binds.push(status.to_string()); }
    }

    if !scode.is_empty() {
        conditions.push("scode = ?".to_string());
        binds.push(scode.to_string());
    }

    if !keyword.is_empty() {
        conditions.push("(title LIKE ? OR tags LIKE ?)".to_string());
        let kw = format!("%{}%", keyword);
        binds.push(kw.clone());
        binds.push(kw);
    }

    let where_clause = conditions.join(" AND ");

    // 查詢列表
    let list_sql = format!(
        "SELECT * FROM ay_content WHERE {} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?",
        where_clause
    );

    let mut all_binds = binds.clone();
    all_binds.push(pagination.pagesize.to_string());
    all_binds.push(offset.to_string());

    let binds_ref: Vec<&str> = all_binds.iter().map(|s| s.as_str()).collect();
    let stmt = db.prepare(&list_sql).bind(&binds_ref)?;
    let result = stmt.all().await?;
    let list: Vec<Content> = result.results()?;

    // 查詢總數
    let count_sql = format!("SELECT COUNT(*) as total FROM ay_content WHERE {}", where_clause);
    let count_binds_ref: Vec<&str> = binds.iter().map(|s| s.as_str()).collect();
    let count_stmt = db.prepare(&count_sql).bind(&count_binds_ref)?;
    let count_result = count_stmt.first::<serde_json::Value>(None).await?;
    let total = count_result
        .and_then(|v| v.get("total").and_then(|t| t.as_i64()))
        .unwrap_or(0) as u32;

    let meta = Meta::new(pagination.page, pagination.pagesize, total);
    response::ok_list(list, meta, "成功")
}

/// 新增內容
pub async fn handle_create_content(
    db: &D1Database,
    body: serde_json::Value,
) -> worker::Result<Response> {
    let title = body
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| worker::Error::RustError("缺少 title 參數".to_string()))?;

    let scode = body
        .get("scode")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let date = body
        .get("date")
        .and_then(|v| v.as_str())
        .unwrap_or(&now);

    let stmt = db
        .prepare(
            "INSERT INTO ay_content (acode, scode, title, content, date, status, istop, isrecommend, isheadline, sorting, visits, likes, oppose, gtype, gid, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, '4', '', ?, ?)",
        )
        .bind(&[
            "cn",
            scode,
            title,
            body.get("content").and_then(|v| v.as_str()).unwrap_or(""),
            date,
            body.get("status").and_then(|v| v.as_str()).unwrap_or("1"),
            body.get("istop").and_then(|v| v.as_str()).unwrap_or("0"),
            body.get("isrecommend").and_then(|v| v.as_str()).unwrap_or("0"),
            body.get("isheadline").and_then(|v| v.as_str()).unwrap_or("0"),
            body.get("sorting").and_then(|v| v.as_str()).unwrap_or("255"),
            &now,
            &now,
        ])?;

    let result = stmt.run().await?;

    if result.changes() > 0 {
        response::ok("內容創建成功")
    } else {
        response::err("內容創建失敗", 1005)
    }
}

/// 修改內容
pub async fn handle_update_content(
    db: &D1Database,
    id: i64,
    body: serde_json::Value,
) -> worker::Result<Response> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let allowed_fields = [
        "title", "titlecolor", "subtitle", "filename", "scode", "subscode",
        "author", "source", "outlink", "date", "ico", "pics", "picstitle",
        "content", "tags", "enclosure", "keywords", "description",
        "sorting", "status", "istop", "isrecommend", "isheadline",
        "gtype", "gid", "gnote", "urlname",
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

    let sql = format!("UPDATE ay_content SET {} WHERE id = ?", sets.join(", "));
    let binds_ref: Vec<&str> = binds.iter().map(|s| s.as_str()).collect();

    db.prepare(&sql).bind(&binds_ref)?.run().await?;

    response::ok("內容更新成功")
}

/// 刪除內容(軟刪除到回收站)
pub async fn handle_delete_content(db: &D1Database, id: i64) -> worker::Result<Response> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    db.prepare("UPDATE ay_content SET status = '-1', update_time = ? WHERE id = ?")
        .bind(&[&now, id])?
        .run()
        .await?;

    response::ok("已移入回收站")
}

/// 恢復內容(從回收站恢復為草稿)
pub async fn handle_restore_content(db: &D1Database, id: i64) -> worker::Result<Response> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    db.prepare("UPDATE ay_content SET status = '0', update_time = ? WHERE id = ?")
        .bind(&[&now, id])?
        .run()
        .await?;

    response::ok("已恢復為草稿")
}

/// 永久刪除內容
pub async fn handle_permanent_delete_content(db: &D1Database, id: i64) -> worker::Result<Response> {
    db.prepare("DELETE FROM ay_content WHERE id = ?")
        .bind(&[id])?
        .run()
        .await?;

    // 同步刪除擴展字段
    let _ = db
        .prepare("DELETE FROM ay_content_ext WHERE contentid = ?")
        .bind(&[id])?
        .run()
        .await;

    response::ok("已永久刪除")
}
