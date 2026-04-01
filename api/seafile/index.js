/**
 * GET  /api/seafile/test      — 测试连接 + 获取资料库列表
 * POST /api/seafile/upload    — 上传文件
 * GET  /api/seafile/download  — 下载文件
 *
 * 使用 Seafile Web API Token 认证（Bearer Token）。
 * 前端直接请求这些接口，由 Vercel 服务端代为请求南大云盘，
 * 绕过浏览器跨域限制。
 */
import { checkAppPassword } from '../_auth.js';

const SEAFILE_BASE = 'https://box.nju.edu.cn/api2';

function seafileHeaders(token) {
  return {
    'Authorization': `Token ${token}`,
    'Accept': 'application/json'
  };
}

// ── GET /api/seafile/test — 获取资料库列表 ─────────────────────────────────
async function handleTest(query) {
  const token = query.token;
  if (!token) return { status: 400, body: { error: '缺少 token 参数' } };

  try {
    const res = await fetch(`${SEAFILE_BASE}/repos/`, {
      headers: seafileHeaders(token)
    });
    if (!res.ok) {
      const text = await res.text();
      return { status: res.status, body: { error: `连接失败 (HTTP ${res.status}): ${text}` } };
    }
    const data = await res.json();
    return {
      status: 200,
      body: { ok: true, repos: data.map(r => ({ id: r.id, name: r.name })) }
    };
  } catch (err) {
    return { status: 500, body: { error: err.message || '网络错误' } };
  }
}

// ── POST /api/seafile/upload ──────────────────────────────────────────────
async function handleUpload(body) {
  const { token, repoId, fileName, meetingId, base64Content } = body;
  if (!token || !repoId || !fileName || !meetingId || !base64Content) {
    return { status: 400, body: { error: 'token, repoId, fileName, meetingId, base64Content 均必填' } };
  }

  try {
    // Step 1: 获取上传链接
    const linkRes = await fetch(
      `${SEAFILE_BASE}/repos/${repoId}/upload-link/?p=${encodeURIComponent('/' + meetingId)}`,
      { headers: seafileHeaders(token) }
    );
    if (!linkRes.ok) {
      const text = await linkRes.text();
      return { status: linkRes.status, body: { success: false, error: `获取上传链接失败 (HTTP ${linkRes.status}): ${text}` } };
    }
    const uploadUrl = await linkRes.json();

    // Step 2: 上传文件（multipart/form-data）
    const binaryStr = Buffer.from(base64Content, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes]);

    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('parent_dir', `/${meetingId}`);
    formData.append('replace', '1');
    formData.append('ret-json', '1');

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Authorization': `Token ${token}` },
      body: formData
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      return { status: uploadRes.status, body: { success: false, error: `上传失败 (HTTP ${uploadRes.status}): ${text}` } };
    }

    const result = await uploadRes.json();
    if (result.success) {
      return { status: 200, body: { success: true, path: `/${meetingId}/${fileName}` } };
    }
    return { status: 200, body: { success: false, error: JSON.stringify(result) } };
  } catch (err) {
    return { status: 500, body: { success: false, error: err.message || '网络错误' } };
  }
}

// ── GET /api/seafile/download ──────────────────────────────────────────────
async function handleDownload(query) {
  const { token, repoId, fileName, meetingId } = query;
  if (!token || !repoId || !fileName || !meetingId) {
    return { status: 400, body: { ok: false, error: '缺少必要参数' } };
  }

  const filePath = `/${meetingId}/${fileName}`;
  try {
    const res = await fetch(
      `${SEAFILE_BASE}/repos/${repoId}/file/detail/?p=${encodeURIComponent(filePath)}`,
      { headers: seafileHeaders(token) }
    );
    if (!res.ok) {
      return {
        status: res.status,
        body: { ok: false, error: `文件不存在或无权限 (HTTP ${res.status})`, status: res.status }
      };
    }
    const data = await res.json();
    // 获取文件下载链接
    const rawUrl = `${SEAFILE_BASE}/repos/${repoId}/files/${encodeURIComponent(filePath)}/?raw=1`;
    const rawRes = await fetch(rawUrl, {
      headers: { 'Authorization': `Token ${token}`, 'Accept': 'application/octet-stream' }
    });
    if (!rawRes.ok) {
      return { status: rawRes.status, body: { ok: false, error: `下载失败 (HTTP ${rawRes.status})`, status: rawRes.status } };
    }
    const arrayBuffer = await rawRes.arrayBuffer();
    const binaryStr = Buffer.from(arrayBuffer).toString('binary');
    const base64 = Buffer.from(binaryStr, 'binary').toString('base64');
    return { status: 200, body: { ok: true, content: base64 } };
  } catch (err) {
    return { status: 500, body: { ok: false, error: err.message || '网络错误' } };
  }
}

// ── 主入口 ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Password');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 解析 path（去掉 query string）来判断路由
  const pathname = (req.url || '').split('?')[0];

  // ── GET /api/seafile/test?token=xxx ────────────────────────────────────
  if (req.method === 'GET' && pathname.endsWith('/test')) {
    const result = await handleTest(req.query);
    return res.status(result.status).json(result.body);
  }

  // ── GET /api/seafile/download?token=...&repoId=...&fileName=...&meetingId=... ──
  if (req.method === 'GET' && pathname.endsWith('/download') && req.query.fileName && req.query.meetingId) {
    const result = await handleDownload(req.query);
    return res.status(result.status).json(result.body);
  }

  // ── POST /api/seafile/upload ────────────────────────────────────────────
  if (req.method === 'POST' && pathname.endsWith('/upload')) {
    const result = await handleUpload(req.body || {});
    return res.status(result.status).json(result.body);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
