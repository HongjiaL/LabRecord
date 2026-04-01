/**
 * 南大云盘共享存储 API（服务端代理）
 * Token 和资料库 ID 从 Vercel 环境变量读取，所有人共用。
 *
 * GET  /api/seafile/test      — 测试连接 + 获取资料库列表
 * GET  /api/seafile/upload-url — 获取 Seafile 上传直链（仅返回链接，不传文件）
 * GET  /api/seafile/download   — 下载文件
 */

const SEAFILE_BASE = 'https://box.nju.edu.cn/api2';

function seafileHeaders(token) {
  return {
    'Authorization': `Token ${token}`,
    'Accept': 'application/json'
  };
}

// ── GET /api/seafile/test — 管理员查看资料库列表 ───────────────────────────
async function handleTest() {
  const token = process.env.SEAFILE_TOKEN;

  if (!token) {
    return {
      status: 200,
      body: {
        configured: false,
        error: 'Vercel 尚未配置 SEAFILE_TOKEN 环境变量'
      }
    };
  }

  try {
    const res = await fetch(`${SEAFILE_BASE}/repos/`, {
      headers: seafileHeaders(token)
    });
    if (!res.ok) {
      const text = await res.text();
      return { status: 200, body: { configured: true, ok: false, error: `连接失败 (HTTP ${res.status}): ${text}` } };
    }
    const data = await res.json();
    const repos = data.map((r) => ({ id: r.id, name: r.name }));

    const repoId = process.env.SEAFILE_REPO_ID;
    const currentRepo = repos.find((r) => r.id === repoId);

    return {
      status: 200,
      body: {
        configured: true,
        ok: true,
        repos,
        currentRepoId: repoId || null,
        currentRepoName: currentRepo ? currentRepo.name : null
      }
    };
  } catch (err) {
    return { status: 200, body: { configured: true, ok: false, error: err.message || '网络错误' } };
  }
}

// ── GET /api/seafile/upload-url ────────────────────────────────────────────
// 返回 Seafile 上传直链，由浏览器直接 POST 文件内容到 Seafile
// 文件不经过 Vercel，彻底解决 4.5MB body 限制
async function handleUploadUrl(query) {
  const token = process.env.SEAFILE_TOKEN;
  const repoId = process.env.SEAFILE_REPO_ID;
  if (!token || !repoId) {
    return { status: 500, body: { ok: false, error: '南大云盘未配置（请在 Vercel 设置 SEAFILE_TOKEN 和 SEAFILE_REPO_ID）' } };
  }

  const { meetingId } = query;
  if (!meetingId) {
    return { status: 400, body: { ok: false, error: '缺少 meetingId 参数' } };
  }

  const dirPath = `/${meetingId}`;

  try {
    // 确保目录存在
    const checkRes = await fetch(
      `${SEAFILE_BASE}/repos/${repoId}/dir/?p=${encodeURIComponent(dirPath)}`,
      { headers: seafileHeaders(token) }
    );
    if (!checkRes.ok) {
      // 目录不存在则创建
      const dirName = dirPath.split('/').filter(Boolean).pop();
      await fetch(
        `${SEAFILE_BASE}/repos/${repoId}/dir/?p=${encodeURIComponent(dirPath)}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ operation: 'mkdir', dir_name: dirName })
        }
      );
    }

    // 获取 Seafile 上传链接
    const linkRes = await fetch(`${SEAFILE_BASE}/repos/${repoId}/upload-link/?p=${encodeURIComponent(dirPath)}`, {
      headers: seafileHeaders(token)
    });
    if (!linkRes.ok) {
      return { status: linkRes.status, body: { ok: false, error: `获取上传链接失败 (HTTP ${linkRes.status})` } };
    }
    let uploadUrl = await linkRes.json();

    // 如果返回的是相对路径，拼成绝对 URL
    if (!uploadUrl.startsWith('http')) {
      uploadUrl = SEAFILE_BASE.replace('/api2', '') + uploadUrl;
    }

    return {
      status: 200,
      body: {
        ok: true,
        uploadUrl,
        token,
        uploadDir: dirPath
      }
    };
  } catch (err) {
    return { status: 500, body: { ok: false, error: err.message || '网络错误' } };
  }
}

// ── GET /api/seafile/download ──────────────────────────────────────────────
async function handleDownload(query) {
  const token = process.env.SEAFILE_TOKEN;
  const repoId = process.env.SEAFILE_REPO_ID;

  if (!token || !repoId) {
    return { status: 500, body: { ok: false, error: '南大云盘未配置' } };
  }

  const { fileName, meetingId } = query;
  if (!fileName || !meetingId) {
    return { status: 400, body: { ok: false, error: '缺少 fileName 或 meetingId' } };
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const pathname = (req.url || '').split('?')[0];
  const fullPath = pathname.startsWith('/api/seafile') ? pathname : `/api/seafile${pathname}`;

  if (req.method === 'GET' && (pathname === '/test' || fullPath.endsWith('/test'))) {
    const result = await handleTest();
    return res.status(result.status).json(result.body);
  }

  if (req.method === 'GET' && (pathname === '/upload-url' || fullPath.endsWith('/upload-url'))) {
    const result = await handleUploadUrl(req.query);
    return res.status(result.status).json(result.body);
  }

  if (req.method === 'GET' && (pathname === '/download' || fullPath.endsWith('/download'))) {
    const result = await handleDownload(req.query);
    return res.status(result.status).json(result.body);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
