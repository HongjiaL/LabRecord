/**
 * POST /api/seafile/upload
 * GET  /api/seafile/download
 * GET  /api/seafile/test
 *
 * Seafile 存储代理：所有前端请求先发给 Vercel，由 Vercel 代为请求南大云盘，
 * 绕过浏览器跨域（CORS）限制。
 *
 * 配置通过请求头 X-Seafile-Config（Base64 JSON）传递，
 * 前端将 seafileConfig 编码后发送，服务端不存储。
 */
import { checkAppPassword } from '../_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Password, X-Seafile-Config');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 解析 Seafile 配置（从请求头）
  let seafileConfig;
  try {
    const encoded = req.headers['x-seafile-config'];
    if (encoded) {
      seafileConfig = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    }
  } catch (_) {
    return res.status(400).json({ error: '无效的 Seafile 配置' });
  }

  const { SEAFILE_API_BASE, SEAFILE_WEBDAV_BASE } = {
    SEAFILE_API_BASE: 'https://box.nju.edu.cn/api2',
    SEAFILE_WEBDAV_BASE: 'https://box.nju.edu.cn/seafdav'
  };

  function getCreds(cfg) {
    return Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  }

  // ── GET /api/seafile/test ────────────────────────────────────────────────
  if (req.method === 'GET' && !req.query.fileName && !req.query.meetingId) {
    if (!seafileConfig) {
      return res.status(400).json({ error: '缺少 Seafile 配置' });
    }
    try {
      const creds = getCreds(seafileConfig);
      const apiRes = await fetch(`${SEAFILE_API_BASE}/repos/`, {
        headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' }
      });
      if (!apiRes.ok) {
        const text = await apiRes.text();
        return res.status(apiRes.status).json({ error: `连接失败 (HTTP ${apiRes.status}): ${text}` });
      }
      const data = await apiRes.json();
      return res.status(200).json({ ok: true, repos: data.map(r => ({ id: r.id, name: r.name })) });
    } catch (err) {
      return res.status(500).json({ error: err.message || '网络错误' });
    }
  }

  // ── GET /api/seafile/download ────────────────────────────────────────────
  if (req.method === 'GET' && req.query.fileName && req.query.meetingId) {
    if (!seafileConfig) {
      return res.status(400).json({ error: '缺少 Seafile 配置' });
    }
    const { fileName, meetingId } = req.query;
    const filePath = `/${meetingId}/${fileName}`;
    try {
      const creds = getCreds(seafileConfig);
      const apiRes = await fetch(`${SEAFILE_WEBDAV_BASE}${filePath}`, {
        headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/octet-stream' }
      });
      if (!apiRes.ok) {
        return res.status(apiRes.status).json({
          ok: false,
          error: `文件不存在或无权限访问: HTTP ${apiRes.status}`,
          status: apiRes.status
        });
      }
      const arrayBuffer = await apiRes.arrayBuffer();
      const binary = String.fromCharCode(...new Uint8Array(arrayBuffer));
      const base64 = Buffer.from(binary, 'binary').toString('base64');
      return res.status(200).json({ ok: true, content: base64 });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message || '网络错误' });
    }
  }

  // ── POST /api/seafile/upload ─────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!seafileConfig) {
      return res.status(400).json({ error: '缺少 Seafile 配置' });
    }
    const { fileName, meetingId, base64Content } = req.body || {};
    if (!fileName || !meetingId || !base64Content) {
      return res.status(400).json({ error: 'fileName, meetingId 和 base64Content 均必填' });
    }

    const creds = getCreds(seafileConfig);
    const dirPath = `/${meetingId}`;

    try {
      // Step 1: 获取上传链接
      const linkRes = await fetch(
        `${SEAFILE_API_BASE}/repos/${seafileConfig.repoId}/upload-link/?p=${encodeURIComponent(dirPath)}`,
        {
          headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' }
        }
      );
      if (!linkRes.ok) {
        const text = await linkRes.text();
        return res.status(linkRes.status).json({ success: false, error: `获取上传链接失败: HTTP ${linkRes.status} ${text}` });
      }
      const uploadUrl = await linkRes.json();

      // Step 2: 将 base64 还原为二进制并上传
      const binary = Buffer.from(base64Content, 'base64').toString('binary');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes]);

      const formData = new FormData();
      formData.append('file', blob, fileName);
      formData.append('parent_dir', dirPath);
      formData.append('replace', '1');
      formData.append('ret-json', '1');

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${creds}` },
        body: formData
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        return res.status(uploadRes.status).json({ success: false, error: `上传失败: HTTP ${uploadRes.status} ${text}` });
      }

      const result = await uploadRes.json();
      return res.status(200).json({
        success: true,
        path: dirPath + '/' + fileName
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || '网络错误' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
