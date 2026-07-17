/// Rust CMS Worker - 主入口
/// 基於 PbootCMS 3.2.12 數據庫結構,純 API 後端
mod model;
mod service;
mod util;

use service::{auth, config, content, sort};
use util::jwt::{self, JwtClaims};
use util::response;
use worker::*;

/// 從請求中提取 JWT 並驗證
async fn extract_claims(
    req: &Request,
    env: &Env,
) -> Option<JwtClaims> {
    let auth_header = req.headers().get("Authorization")?;
    let token = jwt::extract_token(&auth_header)?;
    let secret = env.secret("JWT_SECRET").ok()?.to_string();
    let claims = jwt::verify_jwt(token, &secret).ok()?;

    // 檢查黑名單
    let kv = env.kv("TOKEN_BLACKLIST").ok()?;
    if auth::is_token_blacklisted(&kv, &claims.jti).await.ok()? {
        return None;
    }

    Some(claims)
}

/// CORS 中間件
fn add_cors_headers(mut resp: Response) -> Response {
    let headers = resp.headers_mut();
    let _ = headers.set("Access-Control-Allow-Origin", "*");
    let _ = headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    let _ = headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-API-Key",
    );
    resp
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, ctx: Context) -> Result<Response> {
    // CORS 預檢
    if req.method() == Method::Options {
        return Ok(add_cors_headers(Response::empty()?.with_status(204)));
    }

    // 路由分發
    let router = Router::new();

    let response = router
        // ===== 健康檢查 =====
        .get_async("/api/health", |_req, ctx| async move {
            response::ok_data(
                serde_json::json!({
                    "status": "ok",
                    "version": "0.1.0",
                    "time": chrono::Utc::now().to_rfc3339()
                }),
                "健康",
            )
        })
        // ===== 認證接口 =====
        .post_async("/api/v1/auth/login", |mut req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            let kv = ctx.env.kv("CONFIG_CACHE")?;
            let secret = ctx.env.secret("JWT_SECRET")?.to_string();
            auth::handle_login(&db, &kv, &secret, req).await
        })
        .get_async("/api/v1/auth/profile", |req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(claims) => {
                    let db = ctx.env.d1("DB")?;
                    auth::handle_profile(&db, &claims).await
                }
                None => response::err("未授權或 Token 已過期", 2002),
            }
        })
        .post_async("/api/v1/auth/logout", |req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(claims) => {
                    let kv = ctx.env.kv("TOKEN_BLACKLIST")?;
                    auth::handle_logout(&kv, &claims).await
                }
                None => response::err("未授權", 2002),
            }
        })
        // ===== 前台公開接口 =====
        .get_async("/api/v1/site", |_req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            let site = config::get_site_info(&db).await?;
            match site {
                Some(s) => response::ok_data(s, "成功"),
                None => response::not_found("站點信息未配置"),
            }
        })
        .get_async("/api/v1/sorts", |_req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            sort::handle_sort_tree(&db).await
        })
        .get_async("/api/v1/nav", |_req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            sort::handle_nav(&db).await
        })
        .get_async("/api/v1/sorts/:scode", |_req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            let scode = ctx.param("scode").unwrap_or("");
            sort::handle_sort_detail(&db, scode).await
        })
        .get_async("/api/v1/contents", |req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            let query = req.query()?;
            content::handle_list_contents(&db, &query).await
        })
        .get_async("/api/v1/contents/:id", |req, ctx| async move {
            let db = ctx.env.d1("DB")?;
            let id: i64 = ctx
                .param("id")
                .unwrap_or("0")
                .parse()
                .unwrap_or(0);
            let track = req
                .query::<std::collections::HashMap<String, String>>()
                .ok()
                .and_then(|m| m.get("track").map(|v| v == "1"))
                .unwrap_or(false);
            content::handle_content_detail(&db, id, track).await
        })
        // ===== 後台管理接口 - 內容管理 =====
        .get_async("/api/v1/admin/contents", |req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let query = req.query()?;
                    content::handle_admin_list_contents(&db, &query).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .post_async("/api/v1/admin/contents", |mut req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let body: serde_json::Value = req.json().await?;
                    content::handle_create_content(&db, body).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .put_async("/api/v1/admin/contents/:id", |mut req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let id: i64 = ctx.param("id").unwrap_or("0").parse().unwrap_or(0);
                    let body: serde_json::Value = req.json().await?;
                    content::handle_update_content(&db, id, body).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .delete_async("/api/v1/admin/contents/:id", |req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let id: i64 = ctx.param("id").unwrap_or("0").parse().unwrap_or(0);
                    content::handle_delete_content(&db, id).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .post_async("/api/v1/admin/contents/:id/restore", |req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let id: i64 = ctx.param("id").unwrap_or("0").parse().unwrap_or(0);
                    content::handle_restore_content(&db, id).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .delete_async("/api/v1/admin/contents/:id/permanent", |req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let id: i64 = ctx.param("id").unwrap_or("0").parse().unwrap_or(0);
                    content::handle_permanent_delete_content(&db, id).await
                }
                None => response::err("未授權", 2002),
            }
        })
        // ===== 後台管理接口 - 欄目管理 =====
        .get_async("/api/v1/admin/sorts", |_req, ctx| async move {
            match extract_claims(&_req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    sort::handle_sort_tree(&db).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .post_async("/api/v1/admin/sorts", |mut req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let body: serde_json::Value = req.json().await?;
                    sort::handle_create_sort(&db, body).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .put_async("/api/v1/admin/sorts/:id", |mut req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let id: i64 = ctx.param("id").unwrap_or("0").parse().unwrap_or(0);
                    let body: serde_json::Value = req.json().await?;
                    sort::handle_update_sort(&db, id, body).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .delete_async("/api/v1/admin/sorts/:id", |req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let id: i64 = ctx.param("id").unwrap_or("0").parse().unwrap_or(0);
                    sort::handle_delete_sort(&db, id).await
                }
                None => response::err("未授權", 2002),
            }
        })
        // ===== 後台管理接口 - 系統配置 =====
        .get_async("/api/v1/admin/configs", |_req, ctx| async move {
            match extract_claims(&_req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let kv = ctx.env.kv("CONFIG_CACHE")?;
                    config::handle_list_configs(&db, &kv).await
                }
                None => response::err("未授權", 2002),
            }
        })
        .put_async("/api/v1/admin/configs", |mut req, ctx| async move {
            match extract_claims(&req, &ctx.env).await {
                Some(_) => {
                    let db = ctx.env.d1("DB")?;
                    let kv = ctx.env.kv("CONFIG_CACHE")?;
                    let body: serde_json::Value = req.json().await?;
                    config::handle_update_config(&db, &kv, body).await
                }
                None => response::err("未授權", 2002),
            }
        })
        // ===== 404 兜底 =====
        .run(req, env)
        .await;

    match response {
        Ok(resp) => Ok(add_cors_headers(resp)),
        Err(e) => {
            console_error!("路由錯誤: {:?}", e);
            let err_resp = response::err("內部伺服器錯誤", 500)
                .unwrap_or_else(|_| Response::error("Internal Error", 500).unwrap());
            Ok(add_cors_headers(err_resp))
        }
    }
}
