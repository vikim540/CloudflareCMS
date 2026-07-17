/// 雙 MD5 密碼實現,兼容 PbootCMS 原版
/// PbootCMS 使用 md5(md5(password)) 存儲密碼
use md5::{Digest, Md5};

/// 對密碼進行雙 MD5 加密
pub fn hash_password(password: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(password.as_bytes());
    let first_hash = hasher.finalize();

    let mut hasher2 = Md5::new();
    hasher2.update(&first_hash);
    let second_hash = hasher2.finalize();

    format!("{:x}", second_hash)
}

/// 常量時間比較密碼,防時序攻擊
pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    let input_hash = hash_password(password);
    constant_time_eq(input_hash.as_bytes(), stored_hash.as_bytes())
}

/// 常量時間比較
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_password() {
        // PbootCMS admin/123456 的雙 MD5 值
        let hash = hash_password("123456");
        assert_eq!(hash.len(), 32);
    }

    #[test]
    fn test_verify_password() {
        let password = "test123";
        let hash = hash_password(password);
        assert!(verify_password(password, &hash));
        assert!(!verify_password("wrong", &hash));
    }
}
