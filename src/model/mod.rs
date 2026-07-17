/// 數據模型定義 - 對應 PbootCMS 數據庫表結構
use serde::{Deserialize, Serialize};

/// ay_content 文章表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    pub id: i64,
    pub acode: String,
    pub scode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscode: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub titlecolor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outlink: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ico: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picstitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enclosure: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub sorting: i64,
    pub status: String,
    pub istop: String,
    pub isrecommend: String,
    pub isheadline: String,
    pub visits: i64,
    pub likes: i64,
    pub oppose: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    pub gtype: String,
    pub gid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gnote: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub urlname: Option<String>,
}

/// ay_content_sort 欄目表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentSort {
    pub id: i64,
    pub acode: String,
    pub mcode: String,
    pub pcode: String,
    pub scode: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listtpl: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contenttpl: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ico: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    pub sorting: i64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outlink: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub def1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub def2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub def3: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    pub gtype: String,
    pub gid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub urlname: Option<String>,
}

/// 欄目樹節點 (含子欄目)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentSortNode {
    #[serde(flatten)]
    pub sort: ContentSort,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<ContentSortNode>,
}

/// ay_config 系統配置表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub id: i64,
    pub name: String,
    pub value: String,
    pub r#type: String,
    pub sorting: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// ay_user 管理員表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminUser {
    pub id: i64,
    pub ucode: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub realname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rcodes: Option<String>,
    pub acodes: String,
    pub status: String,
    pub login_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_login_ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lastlogintime: Option<String>,
}

/// ay_single 單頁表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SinglePage {
    pub id: i64,
    pub scode: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub sorting: i64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub createtime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updatetime: Option<String>,
}

/// ay_site 站點信息表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Site {
    pub id: i64,
    pub acode: String,
    pub name: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub statistical: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    pub lang: String,
}

/// ay_message 留言表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: i64,
    pub acode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contacts: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mobile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_os: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_bs: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recontent: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
}

/// ay_link 友情連結
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    pub id: i64,
    pub acode: String,
    pub gid: String,
    pub name: String,
    pub link: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
    pub sorting: i64,
}

/// ay_slide 幻燈片
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Slide {
    pub id: i64,
    pub acode: String,
    pub gid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pic_mobile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button_text: Option<String>,
    pub sorting: i64,
}

/// ay_tags 標籤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub acode: String,
    pub name: String,
    pub link: String,
    pub sorting: i64,
}

/// ay_label 自定義標籤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Label {
    pub id: i64,
    pub name: String,
    pub value: String,
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
