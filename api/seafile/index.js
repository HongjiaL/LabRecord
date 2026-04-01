/**
 * 南大云盘共享存储 API（服务端代理）
 * Token 和资料库 ID 从 Vercel 环境变量读取，所有人共用。
 *
 * GET  /api/seafile/test         — 测试连接 + 获取资料库列表（用于管理员首次配置）
 * GET  /api/seafile/direct-urls  — 返回 Seafile 上传直链（前端直传，绕过 Vercel body 限制）
 * POST /api/seafile/upload        — 上传文件（服务端代理，仅限小文件，最大 4.8MB）
 * GET  /api/seafile/download      — 下载文件（服务端代理）
 */

const SEAFILE_BASE = 'https://box.nju.edu.cn/api2';
const SEAFILE_WEBDAV_BASE = 'https://box.nju.edu.cn/seafdav';
const MAX_BODY_BYTES = 4.8 * 1024 * 1024;

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

    // 如果也配置了 REPO_ID，返回当前选中的资料库信息
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

// ── POST /api/seafile/upload ──────────────────────────────────────────────
async function handleUpload(req) {
  const token = process.env.SEAFILE_TOKEN;
  const repoId = process.env.SEAFILE_REPO_ID;
  if (!token || !repoId) {
    return { status: 500, body: { success: false, error: '南大云盘未配置（请在 Vercel 设置 SEAFILE_TOKEN 和 SEAFILE_REPO_ID）' } };
  }
  const contentType = req.headers['content-type'] || '';
  let fileName, meetingId, binaryBuffer;

  // 方式1：application/x-www-form-urlencoded — 先收集 body，再解析
  if (contentType === 'application/x-www-form-urlencoded' || contentType === 'application/octet-stream') {
    const chunks = [];
    for await (const chunk of req.body) { chunks.push(chunk); }
    const bodyBuffer = Buffer.concat(chunks);
    if (bodyBuffer.length > MAX_BODY_BYTES) {
      return { status: 413, body: { success: false, error: '文件过大，Vercel 单次请求体上限为 4.8MB。请上传更小的文件。' } };
    }
    const decoded = new TextDecoder().decode(bodyBuffer);
    const params = new URLSearchParams(decoded);
    fileName = params.get('fileName');
    meetingId = params.get('meetingId');
    const b64Data = params.get('data');
    if (!b64Data) return { status: 400, body: { success: false, error: '缺少 data 参数' } };
    binaryBuffer = Buffer.from(b64Data, 'base64');
  }
  // 方式2：JSON body（兼容性）
  else if (contentType.includes('application/json')) {
    const body = req.body || {};
    fileName = body.fileName;
    meetingId = body.meetingId;
    const base64Content = body.base64Content;
    if (!fileName || !meetingId || !base64Content) {
      return { status: 400, body: { success: false, error: '缺少 fileName、meetingId 或 base64Content 参数' } };
    }
    binaryBuffer = Buffer.from(base64Content, 'base64');
    if (binaryBuffer.length > MAX_BODY_BYTES) {
      return { status: 413, body: { success: false, error: '文件过大（超过 4.8MB），请上传更小的文件' } };
    }
  } else {
    return { status: 400, body: { success: false, error: `不支持的 Content-Type: ${contentType}` } };
  }

  if (!fileName || !meetingId) return { status: 400, body: { success: false, error: '缺少 fileName 或 meetingId 参数' } };

  try {
    await ensureFolder(token, repoId, `/${meetingId}`);
    const linkRes = await fetch(`${SEAFILE_BASE}/repos/${repoId}/upload-link/?p=${encodeURIComponent('/' + meetingId)}`, { headers: seafileHeaders(token) });
    if (!linkRes.ok) return { status: linkRes.status, body: { success: false, error: `获取上传链接失败 (HTTP ${linkRes.status})` } };
    const uploadUrl = await linkRes.json();
    const blob = new Blob([binaryBuffer]);
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('parent_dir', `/${meetingId}`);
    formData.append('replace', '1');
    formData.append('ret-json', '1');
    const uploadRes = await fetch(uploadUrl, { method: 'POST', headers: { 'Authorization': `Token ${token}` }, body: formData });
    if (!uploadRes.ok) return { status: uploadRes.status, body: { success: false, error: `上传失败 (HTTP ${uploadRes.status})` } };
    const result = await uploadRes.json();
    if (result.success) return { status: 200, body: { success: true, path: `/${meetingId}/${fileName}` } };
    return { status: 200, body: { success: false, error: JSON.stringify(result) } };
  } catch (err) {
    return { status: 500, body: { success: false, error: err.message || '网络错误' } };
  }
}

// ── GET /api/seafile/direct-urls — 返回直传链接和直连下载 URL ──────────────────
// 前端拿到后直接向 Seafile 上传，绕过 Vercel 4.5MB body 限制
async function handleDirectUrls(query) {
  const token = process.env.SEAFILE_TOKEN;
  const repoId = process.env.SEAFILE_REPO_ID;
  if (!token || !repoId) {
    return { status: 500, body: { ok: false, error: '南大云盘未配置（请在 Vercel 设置 SEAFILE_TOKEN 和 SEAFILE_REPO_ID）' } };
  }
  const { fileName, meetingId } = query;
  if (!fileName || !meetingId) {
    return { status: 400, body: { ok: false, error: '缺少 fileName 或 meetingId 参数' } };
  }

  const dirPath = `/${meetingId}`;
  const filePath = `/${meetingId}/${fileName}`;
  const uploadDir = `/${meetingId}`;

  try {
    // 确保目录存在
    await ensureFolder(token, repoId, dirPath);

    // 获取上传链接
    const linkRes = await fetch(`${SEAFILE_BASE}/repos/${repoId}/upload-link/?p=${encodeURIComponent(uploadDir)}`, {
      headers: seafileHeaders(token)
    });
    if (!linkRes.ok) {
      return { status: linkRes.status, body: { ok: false, error: `获取上传链接失败 (HTTP ${linkRes.status})` } };
    }
    const uploadUrl = await linkRes.json();

    return {
      status: 200,
      body: {
        ok: true,
        uploadUrl,       // 上传直连 URL
        webdavDownloadUrl: `${SEAFILE_WEBDAV_BASE}${filePath}`, // WebDAV 下载直连 URL
        filePath,
        token             // 用于 Authorization header
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

// ── 确保目录存在，不存在则自动创建 ────────────────────────────────────────
async function ensureFolder(token, repoId, dirPath) {
  // 检查目录是否存在
  const checkRes = await fetch(
    `${SEAFILE_BASE}/repos/${repoId}/dir/?p=${encodeURIComponent(dirPath)}`,
    { headers: seafileHeaders(token) }
  );
  if (checkRes.ok) return; // 目录已存在

  // 创建目录
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

// ── 主入口 ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const pathname = (req.url || '').split('?')[0];
  const fullPath = pathname.startsWith('/api/seafile') ? pathname : `/api/seafile${pathname}`;

  // ── GET /api/seafile/test ────────────────────────────────────────────────
  if (req.method === 'GET' && (pathname === '/test' || fullPath.endsWith('/test'))) {
    const result = await handleTest();
    return res.status(result.status).json(result.body);
  }

  // ── GET /api/seafile/direct-urls ────────────────────────────────────────
  if (req.method === 'GET' && (pathname === '/direct-urls' || fullPath.endsWith('/direct-urls'))) {
    const result = await handleDirectUrls(req.query);
    return res.status(result.status).json(result.body);
  }

  // ── GET /api/seafile/download ───────────────────────────────────────────
  if (req.method === 'GET' && (pathname === '/download' || fullPath.endsWith('/download'))) {
    const result = await handleDownload(req.query);
    return res.status(result.status).json(result.body);
  }

  // ── POST /api/seafile/upload ────────────────────────────────────────────
  if (req.method === 'POST' && (pathname === '/upload' || fullPath.endsWith('/upload'))) {
    const result = await handleUpload(req);
    return res.status(result.status).json(result.body);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
