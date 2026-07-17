/// 認證服務
use crate::model::AdminUser;
use crate::util::jwt::{self, JwtClaims};
use crate::util::password;
use crate::util::response;
use worker::{kv::KvStore, D1Database, Request, Response};

/// 管理員登錄
pub async fn handle_login(
    db: &D1Database,
    kv: &KvStore,
    jwt_secret: &str,
    req: Request,
) -> worker::Result<Response> {
    let body: serde_json::Value = req.json().await?;

    let username = body
        .get("username")
        .and_then(|v| v.as_str())
        .ok_or_else(|| worker::Error::RustError("缺少 username 參數".to_string()))?;

    let password_input = body
        .get("password")
        .and_then(|v| v.as_str())
        .ok_or_else(|| worker::Error::RustError("缺少 password 參數".to_string()))?;

    // 查詢用戶
    let stmt = db
        .prepare("SELECT * FROM ay_user WHERE username = ? AND status = '1' LIMIT 1")
        .bind(&[username])?;

    let user: Option<AdminUser> = stmt.first().await?;

    match user {
        Some(user) => {
            // 驗證密碼(雙 MD5 + 常量時間比較)
            if !password::verify_password(password_input, &user.password) {
                return response::err("用戶名或密碼錯誤", 2001);
            }

            // 簽發 JWT
            let now = chrono::Utc::now().timestamp() as u64;
            let exp = now + 7 * 24 * 3600; // 7天過期

            let claims = JwtClaims {
                sub: user.id.to_string(),
                username: user.username.clone(),
                iat: now,
                exp,
                jti: jwt::gen_uuid(),
            };

            let token = jwt::sign_jwt(&claims, jwt_secret)
                .map_err(|e| worker::Error::RustError(e))?;

            // 更新登錄信息
            let now_str = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let _ = db
                .prepare(
                    "UPDATE ay_user SET login_count = login_count + 1, lastlogintime = ? WHERE id = ?",
                )
                .bind(&[&now_str, user.id])?
                .run()
                .await;

            let data = serde_json::json!({
                "token": token,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "realname": user.realname,
                },
                "expires": exp,
            });

            response::ok_data(data, "登錄成功")
        }
        None => response::err("用戶名或密碼錯誤", 2001),
    }
}

/// 獲取當前用戶信息
pub async fn handle_profile(
    db: &D1Database,
    claims: &JwtClaims,
) -> worker::Result<Response> {
    let id: i64 = claims
        .sub
        .parse()
        .map_err(|_| worker::Error::RustError("無效的用戶 ID".to_string()))?;

    let stmt = db
        .prepare("SELECT id, ucode, username, realname, acodes, status, login_count, lastlogintime FROM ay_user WHERE id = ?")
        .bind(&[id])?;

    let result: Option<serde_json::Value> = stmt.first().await?;

    match result {
        Some(user) => response::ok_data(user, "成功"),
        None => response::not_found("用戶不存在"),
    }
}

/// 登出(將 token jti 加入 KV 黑名單)
pub async fn handle_logout(
    kv: &KvStore,
    claims: &JwtClaims,
) -> worker::Result<Response> {
    let ttl = claims.exp - (chrono::Utc::now().timestamp() as u64);
    if ttl > 0 {
        let key = format!("token:black:{}", claims.jti);
        kv.put(&key, "1")?
            .expiration_ttl(ttl as u64)
            .execute()
            .await?;
    }
    response::ok("登出成功")
}

/// 檢查 token 是否在黑名單中
pub async fn is_token_blacklisted(
    kv: &KvStore,
    jti: &str,
) -> worker::Result<bool> {
    let key = format!("token:black:{}", jti);
    let val = kv.get(&key).text().await?;
    Ok(val.is_some())
}
