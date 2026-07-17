/**
 * Pages Function: 代理所有 /api/* 請求到 Worker
 * 解決跨域問題，前後端同域名
 */

const WORKER_URL = 'https://cms.vikim.eu.org'

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url)
  const targetUrl = `${WORKER_URL}${url.pathname}${url.search}`

  // 複製請求，保留方法和頭部
  const newRequest = new Request(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
    redirect: 'manual',
  })

  // 發送到 Worker
  const response = await fetch(newRequest)

  // 複製響應，添加 CORS 頭
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })

  newResponse.headers.set('Access-Control-Allow-Origin', '*')
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key')

  return newResponse
}
