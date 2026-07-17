/**
 * 通知服務 - Webhook 推送 + 郵件通知
 * 參考 pbootcms-go 的 webhook.go 和 mailer.go 實現
 *
 * 功能:
 *   1. Webhook 推送 (釘釘 ActionCard / 企業微信 Markdown / 通用 JSON)
 *   2. 郵件通知 (MailChannels API, 兼容 Cloudflare Email Service)
 *   3. 美觀的 HTML 郵件模板
 *
 * 配置項 (存儲在 ay_config 表, 不修改表結構):
 *   - webhook_url: 推送目標 URL (空則跳過)
 *   - webhook_message: 留言推送開關 ('1'=啟用)
 *   - webhook_form: 表單推送開關 ('1'=啟用)
 *   - webhook_comment: 評論推送開關 ('1'=啟用)
 *   - smtp_server / smtp_port / smtp_ssl / smtp_username / smtp_password: SMTP 配置 (參考用)
 *   - mail_provider: 郵件服務提供者 ('mailchannels' | 'resend' | 'cf_email')
 *   - mail_api_key: 郵件服務 API Key
 *   - mail_from: 發件人地址
 *   - mail_from_name: 發件人名稱
 *   - message_send_to: 留言接收郵箱
 */
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { okData, ok, err } from '../utils/response';

/** 通知字段 (label + value 鍵值對) */
export interface NotifyField {
  label: string;
  value: string;
}

/** 通知元信息 */
export interface NotifyMeta {
  ip: string;
  os: string;
  browser: string;
  sourceUrl?: string;
  timestamp?: string;
}

/** 簡易 User-Agent 解析 */
function parseUserAgent(ua: string): { os: string; bs: string } {
  let os = 'Unknown';
  let bs = 'Unknown';
  if (!ua) return { os, bs };
  if (/Windows NT 10/.test(ua)) os = 'Windows 10';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  if (/Edg\//.test(ua)) bs = 'Edge';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) bs = 'Chrome';
  else if (/Firefox\//.test(ua)) bs = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) bs = 'Safari';
  else if (/MSIE|Trident/.test(ua)) bs = 'IE';
  return { os, bs };
}

/** 當前時間字符串 */
function nowStr(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** 從配置 map 讀取值 */
function cfg(configs: Record<string, string>, key: string, defaultValue = ''): string {
  return configs[key] ?? defaultValue;
}

/** IP 正規化 (::1 -> 127.0.0.1) */
function normalizeIp(ip: string): string {
  return ip === '::1' ? '127.0.0.1' : ip;
}

// ============================================================================
// Webhook 推送 (參考 Go 版 webhook.go)
// ============================================================================

/** 根據 URL 判斷目標平台 */
type WebhookPlatform = 'dingtalk' | 'wecom' | 'generic';

function detectPlatform(url: string): WebhookPlatform {
  if (url.includes('oapi.dingtalk.com')) return 'dingtalk';
  if (url.includes('qyapi.weixin.qq.com')) return 'wecom';
  return 'generic';
}

/** 構建釘釘 ActionCard 消息體 (參考 Go 版 buildDingTalkActionCard) */
function buildDingTalkActionCard(
  formName: string,
  fields: NotifyField[],
  meta: NotifyMeta,
  detailUrl: string,
): Record<string, unknown> {
  const ts = meta.timestamp || nowStr();
  const ip = normalizeIp(meta.ip);

  let text = `#### ${formName}\n\n`;
  text += `> **時間**: ${ts}\n\n`;
  text += `> **IP**: ${ip}`;
  if (meta.os && meta.os !== 'Unknown') text += `  |  **系統**: ${meta.os}`;
  if (meta.browser && meta.browser !== 'Unknown') text += `  |  **瀏覽器**: ${meta.browser}`;
  text += '\n\n';
  if (meta.sourceUrl) text += `> **來源**: ${meta.sourceUrl}\n\n`;
  text += '---\n';

  for (const f of fields) {
    if (f.value) text += `**${f.label}**: ${f.value}\n\n`;
  }

  return {
    msgtype: 'actionCard',
    actionCard: {
      title: formName,
      text,
      singleTitle: '查看詳情',
      singleURL: detailUrl,
      hideAvatar: '0',
    },
  };
}

/** 構建企業微信 Markdown 消息體 (參考 Go 版 buildWeComPayload) */
function buildWeComMarkdown(
  formName: string,
  fields: NotifyField[],
  meta: NotifyMeta,
): Record<string, unknown> {
  const ts = meta.timestamp || nowStr();
  const ip = normalizeIp(meta.ip);

  let content = `### ${formName}\n\n`;
  content += `**時間**: ${ts}\n`;
  content += `**IP**: ${ip}`;
  if (meta.os && meta.os !== 'Unknown') content += `  |  **系統**: ${meta.os}`;
  if (meta.browser && meta.browser !== 'Unknown') content += `  |  **瀏覽器**: ${meta.browser}`;
  content += '\n';
  if (meta.sourceUrl) content += `**來源**: ${meta.sourceUrl}\n`;
  content += '\n';

  for (const f of fields) {
    if (f.value) content += `**${f.label}**: ${f.value}\n`;
  }

  return {
    msgtype: 'markdown',
    markdown: { content },
  };
}

/** 構建通用 JSON 消息體 */
function buildGenericPayload(
  formName: string,
  fields: NotifyField[],
  meta: NotifyMeta,
): Record<string, unknown> {
  return {
    form_name: formName,
    timestamp: meta.timestamp || nowStr(),
    ip: normalizeIp(meta.ip),
    os: meta.os,
    browser: meta.browser,
    source_url: meta.sourceUrl || '',
    fields,
  };
}

/** 釘釘/企業微信回應結構 */
interface RobotResponse {
  errcode?: number;
  errmsg?: string;
  error?: string;
}

/**
 * 發送 Webhook 推送 (參考 Go 版 SendWithURL)
 * @param configs 配置 map
 * @param category 類別 ('message' | 'form' | 'comment')
 * @param formName 表單名稱 (如 "在線留言")
 * @param fields 通知字段
 * @param meta 元信息 (IP/OS/瀏覽器/來源URL)
 * @param detailUrl 後台管理 URL (用於釘釘卡片跳轉)
 */
export async function sendWebhook(
  configs: Record<string, string>,
  category: 'message' | 'form' | 'comment',
  formName: string,
  fields: NotifyField[],
  meta: NotifyMeta,
  detailUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = cfg(configs, 'webhook_url');
  if (!webhookUrl) return { success: false, error: 'webhook_url 未配置' };

  // 檢查分項開關
  const switchKey = `webhook_${category}`;
  if (cfg(configs, switchKey) !== '1') {
    return { success: false, error: `${switchKey} 未啟用` };
  }

  const platform = detectPlatform(webhookUrl);
  let payload: Record<string, unknown>;

  switch (platform) {
    case 'dingtalk':
      payload = buildDingTalkActionCard(formName, fields, meta, detailUrl);
      break;
    case 'wecom':
      payload = buildWeComMarkdown(formName, fields, meta);
      break;
    default:
      payload = buildGenericPayload(formName, fields, meta);
      break;
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}` };
    }

    // 釘釘/企業微信返回 errcode
    if (platform === 'dingtalk' || platform === 'wecom') {
      const result = (await resp.json()) as RobotResponse;
      if (result.errcode && result.errcode !== 0) {
        return { success: false, error: result.errmsg || `errcode: ${result.errcode}` };
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '未知錯誤' };
  }
}

// ============================================================================
// 郵件通知 (參考 Go 版 mailer.go)
// ============================================================================

/**
 * 構建美觀的通知郵件 HTML 模板
 * 包含: 漸層 header (站點名+logo) / 通知標題 / 字段列表 / 來源信息 / 專業 footer
 */
export function buildNotifyEmailHtml(
  siteName: string,
  siteLogo: string,
  formName: string,
  fields: NotifyField[],
  meta: NotifyMeta,
): string {
  const ts = meta.timestamp || nowStr();
  const ip = normalizeIp(meta.ip);
  const fieldRows = fields
    .filter((f) => f.value)
    .map(
      (f) => `
        <tr>
          <td style="padding:8px 16px;color:#6b7280;font-size:14px;white-space:nowrap;border-bottom:1px solid #f3f4f6;">${f.label}</td>
          <td style="padding:8px 16px;color:#1f2937;font-size:14px;word-break:break-all;border-bottom:1px solid #f3f4f6;">${f.value}</td>
        </tr>`,
    )
    .join('');

  const logoHtml = siteLogo
    ? `<img src="${siteLogo}" alt="Logo" style="height:32px;max-width:120px;object-fit:contain;" />`
    : `<span style="font-size:20px;font-weight:700;color:#fff;">${siteName || 'CMS'}</span>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;min-height:100vh;">
    <tr><td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;">

        <!-- Header: 漸層背景 -->
        <tr>
          <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="left">${logoHtml}</td>
                <td align="right" style="color:rgba(255,255,255,0.85);font-size:12px;">${ts}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- 通知標題 -->
        <tr>
          <td style="padding:24px 32px 8px;">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#1f2937;">${formName}</h1>
            <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;">您收到一條新的通知，請及時處理</p>
          </td>
        </tr>

        <!-- 字段內容 -->
        <tr>
          <td style="padding:8px 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              ${fieldRows}
            </table>
          </td>
        </tr>

        <!-- 來源信息卡片 -->
        <tr>
          <td style="padding:0 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:12px 16px;">
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#6b7280;">
                  <span style="display:inline-block;width:70px;color:#9ca3af;">來源 IP</span>
                  <span style="color:#374151;font-weight:500;">${ip}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#6b7280;">
                  <span style="display:inline-block;width:70px;color:#9ca3af;">操作系統</span>
                  <span style="color:#374151;font-weight:500;">${meta.os || 'Unknown'}</span>
                  <span style="display:inline-block;width:60px;color:#9ca3af;margin-left:16px;">瀏覽器</span>
                  <span style="color:#374151;font-weight:500;">${meta.browser || 'Unknown'}</span>
                </td>
              </tr>
              ${meta.sourceUrl ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;"><span style="display:inline-block;width:70px;color:#9ca3af;">來源頁面</span><span style="color:#4f46e5;word-break:break-all;">${meta.sourceUrl}</span></td></tr>` : ''}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
              此郵件由 ${siteName || 'CMS系統'} 自動發送，請勿直接回覆。<br/>
              &copy; ${new Date().getFullYear()} ${siteName || 'CMS'}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * 發送郵件通知 (使用 MailChannels API)
 * Workers 環境無法直接 TCP 連接 SMTP, 使用 HTTP API 替代
 *
 * @param configs 配置 map
 * @param to 收件人 (逗號分隔多個)
 * @param subject 郵件主題
 * @param htmlBody HTML 內容
 */
export async function sendNotifyMail(
  configs: Record<string, string>,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<{ success: boolean; error?: string }> {
  if (!to) return { success: false, error: '收件人為空' };

  const fromEmail = cfg(configs, 'mail_from', 'noreply@example.com');
  const fromName = cfg(configs, 'mail_from_name', 'CMS 系統');
  const provider = cfg(configs, 'mail_provider', 'mailchannels');
  const apiKey = cfg(configs, 'mail_api_key');

  const recipients = to.split(',').map((e) => e.trim()).filter(Boolean);
  if (recipients.length === 0) return { success: false, error: '收件人為空' };

  try {
    if (provider === 'resend') {
      // Resend API (https://resend.com/api/emails)
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: recipients,
          subject,
          html: htmlBody,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return { success: false, error: `Resend API: ${resp.status} ${errText}` };
      }
      return { success: true };
    }

    // 默認: MailChannels API (https://api.mailchannels.net/tx/v1/send)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        personalizations: [{ to: recipients.map((email) => ({ email })) }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: htmlBody }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `MailChannels: ${resp.status} ${errText}` };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '未知錯誤' };
  }
}

// ============================================================================
// 綜合通知觸發 (留言 / 表單 / 評論)
// ============================================================================

/** 獲取站點信息 (用於郵件模板中的站點名稱和 logo) */
async function getSiteInfoForNotify(
  db: D1Database,
): Promise<{ name: string; logo: string; domain: string }> {
  const site = await db
    .prepare('SELECT name, title, logo, domain FROM ay_site WHERE acode = ? LIMIT 1')
    .bind('cn')
    .first<{ name?: string; title?: string; logo?: string; domain?: string }>();

  const name = site?.title || site?.name || 'CMS';
  const logo = site?.logo || '';
  const domain = site?.domain || '';
  return { name, logo, domain };
}

/** 構建後台管理 URL */
function buildAdminUrl(domain: string, category: string): string {
  const base = domain ? `https://${domain.replace(/^https?:\/\//, '')}` : '';
  const adminPath =
    category === 'comment'
      ? '/admin/member/comment/index'
      : category === 'form'
        ? '/admin/content/form/index'
        : '/admin/content/message/index';
  return `${base}${adminPath}`;
}

/**
 * 留言提交後的通知觸發 (郵件 + Webhook)
 * 參考 Go 版 front.go Message() 方法中的通知邏輯
 *
 * @param db 數據庫
 * @param kv KV 緩存 (讀取配置)
 * @param category 類別 ('message' | 'form' | 'comment')
 * @param formName 表單名稱
 * @param fields 通知字段
 * @param ip 訪問者 IP
 * @param userAgent 訪問者 UA
 * @param sourceUrl 來源頁面 URL
 */
export async function triggerNotify(
  db: D1Database,
  kv: KVNamespace,
  category: 'message' | 'form' | 'comment',
  formName: string,
  fields: NotifyField[],
  ip: string,
  userAgent: string,
  sourceUrl?: string,
): Promise<void> {
  try {
    // 讀取全部配置 (從 KV 緩存)
    const cached = await kv.get('config:all');
    let configs: Record<string, string> = {};
    if (cached) {
      try {
        configs = JSON.parse(cached);
      } catch {
        // KV 數據損壞,回退 D1
      }
    }
    if (Object.keys(configs).length === 0) {
      const result = await db.prepare('SELECT name, value FROM ay_config').all<{ name: string; value: string }>();
      for (const row of result.results) {
        configs[row.name] = row.value;
      }
    }

    const { os, bs } = parseUserAgent(userAgent);
    const meta: NotifyMeta = { ip, os, browser: bs, sourceUrl, timestamp: nowStr() };

    // 獲取站點信息
    const site = await getSiteInfoForNotify(db);
    const detailUrl = buildAdminUrl(site.domain, category);

    // 1. 郵件通知 (獨立開關判斷)
    const mailSwitchKey =
      category === 'message' ? 'message_send_mail' : category === 'form' ? 'form_send_mail' : 'comment_send_mail';
    const mailSendTo = cfg(configs, 'message_send_to');
    if (cfg(configs, mailSwitchKey) === '1' && mailSendTo) {
      const htmlBody = buildNotifyEmailHtml(site.name, site.logo, formName, fields, meta);
      const subject = `新通知：${formName}`;
      const mailResult = await sendNotifyMail(configs, mailSendTo, subject, htmlBody);
      // 記錄日誌到 ay_syslog
      await logNotify(db, 'mail', mailResult.success, mailResult.error || `${formName} -> ${mailSendTo}`);
    }

    // 2. Webhook 推送 (獨立開關判斷, 在 sendWebhook 內部檢查)
    const webhookResult = await sendWebhook(configs, category, formName, fields, meta, detailUrl);
    if (webhookResult.success || webhookResult.error !== `${`webhook_${category}`} 未啟用`) {
      await logNotify(db, 'webhook', webhookResult.success, webhookResult.error || `${formName} -> webhook`);
    }
  } catch (e) {
    // 通知失敗不影響主流程, 僅記錄錯誤
    console.error('通知觸發失敗:', e);
  }
}

/** 記錄通知日誌到 ay_syslog (復用 Go 版設計, 不新建表) */
async function logNotify(
  db: D1Database,
  type: 'mail' | 'webhook',
  success: boolean,
  message: string,
): Promise<void> {
  try {
    const level = success ? `${type}_success` : `${type}_error`;
    const event = message.slice(0, 200); // event 字段 VARCHAR(200), 安全截斷
    const now = nowStr();
    await db
      .prepare(
        "INSERT INTO ay_syslog (level, event, ip, create_time) VALUES (?, ?, ?, ?)",
      )
      .bind(level, event, '127.0.0.1', now)
      .run();
  } catch {
    // 日誌記錄失敗不影響主流程
  }
}

// ============================================================================
// 測試接口 (供後台「通知測試」按鈕調用)
// ============================================================================

/** 讀取全部配置 (優先 KV 緩存, 回退 D1) */
async function loadConfigs(db: D1Database, kv: KVNamespace): Promise<Record<string, string>> {
  const cached = await kv.get('config:all');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { /* fallthrough */ }
  }
  const result = await db.prepare('SELECT name, value FROM ay_config').all<{ name: string; value: string }>();
  const map: Record<string, string> = {};
  for (const row of result.results) {
    map[row.name] = row.value;
  }
  return map;
}

/**
 * 郵件發送測試 (後台測試按鈕)
 * body: { to: string }
 */
export async function handleTestMail(
  db: D1Database,
  kv: KVNamespace,
  body: { to?: string },
): Promise<Response> {
  const to = body.to;
  if (!to) return err('缺少收件人 to 參數', 1001);

  const configs = await loadConfigs(db, kv);
  const site = await getSiteInfoForNotify(db);
  const ts = nowStr();

  const fields: NotifyField[] = [
    { label: '測試類型', value: '郵件配置驗證' },
    { label: '收件地址', value: to },
    { label: '發送時間', value: ts },
  ];
  const meta: NotifyMeta = { ip: '127.0.0.1', os: 'Server', browser: 'Test', timestamp: ts };
  const html = buildNotifyEmailHtml(site.name, site.logo, '郵件測試通知', fields, meta);
  const result = await sendNotifyMail(configs, to, '測試郵件 - CMS 系統通知', html);

  await logNotify(db, 'mail', result.success, result.error || `測試郵件 -> ${to}`);

  if (result.success) return ok('測試郵件發送成功');
  return err(`郵件發送失敗: ${result.error}`, 1005);
}

/**
 * Webhook 推送測試 (後台測試按鈕)
 * body: { category?: 'message' | 'form' | 'comment' }
 */
export async function handleTestWebhook(
  db: D1Database,
  kv: KVNamespace,
  body: { category?: 'message' | 'form' | 'comment' },
): Promise<Response> {
  const configs = await loadConfigs(db, kv);
  const webhookUrl = cfg(configs, 'webhook_url');
  if (!webhookUrl) return err('webhook_url 未配置', 1001);

  const category = body.category || 'message';
  const site = await getSiteInfoForNotify(db);
  const detailUrl = buildAdminUrl(site.domain, category);
  const ts = nowStr();

  const fields: NotifyField[] = [
    { label: '測試類型', value: 'Webhook 推送驗證' },
    { label: '目標平台', value: detectPlatform(webhookUrl) },
    { label: '推送時間', value: ts },
  ];
  const meta: NotifyMeta = { ip: '127.0.0.1', os: 'Server', browser: 'Test', timestamp: ts };

  // 測試時臨時覆蓋開關為啟用
  const testConfigs = { ...configs, [`webhook_${category}`]: '1' };
  const result = await sendWebhook(testConfigs, category, 'Webhook 測試通知', fields, meta, detailUrl);

  await logNotify(db, 'webhook', result.success, result.error || `測試 Webhook -> ${webhookUrl}`);

  if (result.success) return ok('測試 Webhook 推送成功');
  return err(`Webhook 推送失敗: ${result.error}`, 1005);
}
