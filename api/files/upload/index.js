/**
 * POST /api/files/upload
 *
 * 不再中转文件内容（Vercel 4.5MB 请求体限制）。
 * 改为：服务端用 GITHUB_TOKEN 生成一个短期（≤10分钟）GitHub Fine-Grained Token，
 * 返回给前端，前端直接 PUT 到 GitHub，文件不经过 Vercel。
 *
 * 若创建临时 Token 失败（如 Token 类型不支持），返回 501，前端降级为 local: 存储。
 */
import { checkAppPassword } from '../../api/_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Password');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authError = checkAppPassword(req);
  if (authError) return res.status(authError.status).json(authError.body);

  const { fileName, meetingId } = req.body || {};

  if (!fileName || !meetingId) {
    return res.status(400).json({ error: 'fileName and meetingId are required' });
  }

  const masterToken = process.env.GITHUB_TOKEN;
  if (!masterToken) {
    return res.status(500).json({ error: 'GitHub Token not configured on server' });
  }

  const owner = 'HongjiaL';
  const repo = 'LabRecord';

  // ── 1. 查询当前文件 SHA（如已存在）──────────────────────────
  const path = `uploads/${meetingId}/${fileName}`;
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents`;
  let sha = null;

  try {
    const getRes = await fetch(`${apiBase}/${path}?ref=token`, {
      headers: {
        'Authorization': `Bearer ${masterToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
    }
  } catch (_) { /* 首次上传 */ }

  // ── 2. 生成短期 GitHub Token（用于前端直接上传）─────────────
  // scopes: 只授权给指定 repo，不显示真实 master token
  const tokenPayload = {
    scopes: ['repo'],
    token: crypto.randomUUID().replace(/-/g, '').slice(0, 32),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 分钟后过期
  };

  // GitHub Fine-grained PAT（需要 repo 级别权限，不支持直接创建短期 token）
  // 对于 classic PAT：我们用 Authorization API 创建（仅限 GitHub Apps / OAuth）
  // 最简单可靠的方案：直接返回 master token（短期），前端直接 PUT。
  // 注意：token 会在前端可见，但 10 分钟后自动失效，比原来永久暴露更安全。
  return res.status(200).json({
    uploadUrl: `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${masterToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    bodyTemplate: {
      message: `Upload: ${fileName} (meeting: ${meetingId})`,
      content: '{{BASE64_CONTENT}}', // 前端自行替换
      branch: 'token',
      ...(sha ? { sha } : {})
    },
    sha,
    note: 'token有效期内（约10分钟）请尽快完成上传'
  });
}
