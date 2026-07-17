/// 分頁工具
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub page: u32,
    pub pagesize: u32,
}

impl Pagination {
    /// 從查詢參數解析分頁
    pub fn from_query(query: &worker::QueryMap) -> Self {
        let page = query
            .get("page")
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(1)
            .max(1);

        let pagesize = query
            .get("pagesize")
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(20)
            .min(100)
            .max(1);

        Self { page, pagesize }
    }

    /// 計算 SQL OFFSET
    pub fn offset(&self) -> u32 {
        (self.page - 1) * self.pagesize
    }

    /// 計算總頁數
    pub fn total_pages(total: u32) -> u32 {
        if total == 0 {
            return 0;
        }
        (total + 20 - 1) / 20
    }
}

/// 計算總頁數 (帶 pagesize)
pub fn calc_total_pages(total: u32, pagesize: u32) -> u32 {
    if total == 0 || pagesize == 0 {
        return 0;
    }
    (total + pagesize - 1) / pagesize
}
