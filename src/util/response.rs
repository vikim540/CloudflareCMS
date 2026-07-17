/// 統一 API 響應格式
use serde::{Deserialize, Serialize};
use worker::Response;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T: Serialize> {
    pub code: i32,
    pub msg: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<Meta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meta {
    pub page: u32,
    pub pagesize: u32,
    pub total: u32,
}

impl Meta {
    pub fn new(page: u32, pagesize: u32, total: u32) -> Self {
        Self {
            page,
            pagesize,
            total,
        }
    }
}

/// 成功響應 (無數據)
pub fn ok(msg: &str) -> worker::Result<Response> {
    let body = ApiResponse::<serde_json::Value> {
        code: 0,
        msg: msg.to_string(),
        data: None,
        meta: None,
    };
    Response::from_json(&body)
}

/// 成功響應 (帶數據)
pub fn ok_data<T: Serialize>(data: T, msg: &str) -> worker::Result<Response> {
    let body = ApiResponse {
        code: 0,
        msg: msg.to_string(),
        data: Some(data),
        meta: None,
    };
    Response::from_json(&body)
}

/// 成功響應 (帶分頁數據)
pub fn ok_list<T: Serialize>(data: T, meta: Meta, msg: &str) -> worker::Result<Response> {
    let body = ApiResponse {
        code: 0,
        msg: msg.to_string(),
        data: Some(data),
        meta: Some(meta),
    };
    Response::from_json(&body)
}

/// 失敗響應
pub fn err(msg: &str, code: i32) -> worker::Result<Response> {
    let body = ApiResponse::<serde_json::Value> {
        code,
        msg: msg.to_string(),
        data: None,
        meta: None,
    };
    let resp = Response::from_json(&body)?;
    Ok(resp.with_status(if code >= 2000 { 401 } else { 400 }))
}

/// 404 響應
pub fn not_found(msg: &str) -> worker::Result<Response> {
    let body = ApiResponse::<serde_json::Value> {
        code: 1004,
        msg: msg.to_string(),
        data: None,
        meta: None,
    };
    let resp = Response::from_json(&body)?;
    Ok(resp.with_status(404))
}
