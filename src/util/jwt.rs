/// JWT HS256 自行實現
/// 使用 sha2 + hmac 純 Rust 實現,避免 jsonwebtoken 的 C 依賴
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtClaims {
    /// 管理員 ID
    pub sub: String,
    /// 用戶名
    pub username: String,
    /// 簽發時間 (Unix 時間戳, 秒)
    pub iat: u64,
    /// 過期時間 (Unix 時間戳, 秒)
    pub exp: u64,
    /// 唯一標識 (用於黑名單)
    pub jti: String,
}

/// 簽發 JWT Token
pub fn sign_jwt(claims: &JwtClaims, secret: &str) -> Result<String, String> {
    let header = r#"{"alg":"HS256","typ":"JWT"}"#;
    let header_b64 = URL_SAFE_NO_PAD.encode(header);
    let claims_json = serde_json::to_string(claims).map_err(|e| e.to_string())?;
    let claims_b64 = URL_SAFE_NO_PAD.encode(claims_json);

    let signing_input = format!("{}.{}", header_b64, claims_b64);

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).map_err(|e| e.to_string())?;
    mac.update(signing_input.as_bytes());
    let signature = mac.finalize().into_bytes();
    let sig_b64 = URL_SAFE_NO_PAD.encode(signature);

    Ok(format!("{}.{}", signing_input, sig_b64))
}

/// 驗證 JWT Token,返回 Claims
pub fn verify_jwt(token: &str, secret: &str) -> Result<JwtClaims, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("invalid token format".to_string());
    }

    let signing_input = format!("{}.{}", parts[0], parts[1]);
    let expected_sig = URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|e| e.to_string())?;

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).map_err(|e| e.to_string())?;
    mac.update(signing_input.as_bytes());
    mac.verify_slice(&expected_sig)
        .map_err(|_| "invalid signature".to_string())?;

    let claims_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|e| e.to_string())?;
    let claims: JwtClaims =
        serde_json::from_slice(&claims_bytes).map_err(|e| e.to_string())?;

    // 檢查過期時間
    let now = chrono::Utc::now().timestamp() as u64;
    if claims.exp < now {
        return Err("token expired".to_string());
    }

    Ok(claims)
}

/// 從請求頭提取 JWT Token
pub fn extract_token(authorization: &str) -> Option<&str> {
    if authorization.starts_with("Bearer ") {
        Some(&authorization[7..])
    } else {
        None
    }
}

/// 生成 UUID (簡易版,用 jti)
pub fn gen_uuid() -> String {
    let now = chrono::Utc::now().timestamp_millis() as u128;
    format!("{:032x}", now)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_sign_verify() {
        let claims = JwtClaims {
            sub: "1".to_string(),
            username: "admin".to_string(),
            iat: 1000,
            exp: 9999999999,
            jti: "test-jti".to_string(),
        };
        let secret = "test-secret";
        let token = sign_jwt(&claims, secret).unwrap();
        let verified = verify_jwt(&token, secret).unwrap();
        assert_eq!(verified.sub, "1");
        assert_eq!(verified.username, "admin");
    }

    #[test]
    fn test_jwt_invalid_token() {
        let result = verify_jwt("invalid.token.here", "secret");
        assert!(result.is_err());
    }
}
