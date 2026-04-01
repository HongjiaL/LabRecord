/**
 * 南大云盘共享存储 API（服务端代理）
 * Token 和资料库 ID 从 Vercel 环境变量读取，所有人共用。
 *
 * GET  /api/seafile/test       — 测试连接 + 获取资料库列表（用于管理员首次配置）
 * POST /api/seafile/upload     — 上传文件
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
async function handleUpload(body) {
  const token = process.env.SEAFILE_TOKEN;
  const repoId = process.env.SEAFILE_REPO_ID;

  if (!token || !repoId) {
    return { status: 500, body: { success: false, error: '南大云盘未配置（请在 Vercel 设置 SEAFILE_TOKEN 和 SEAFILE_REPO_ID）' } };
  }

  const { fileName, meetingId, base64Content } = body;
  if (!fileName || !meetingId || !base64Content) {
    return { status: 400, body: { success: false, error: '缺少 fileName、meetingId 或 base64Content 参数' } };
  }

  try {
    // 先确保目录存在
    await ensureFolder(token, repoId, `/${meetingId}`);

    // 获取上传链接
    const linkRes = await fetch(
      `${SEAFILE_BASE}/repos/${repoId}/upload-link/?p=${encodeURIComponent('/' + meetingId)}`,
      { headers: seafileHeaders(token) }
    );
    if (!linkRes.ok) {
      const text = await linkRes.text();
      return { status: linkRes.status, body: { success: false, error: `获取上传链接失败 (HTTP ${linkRes.status}): ${text}` } };
    }
    const uploadUrl = await linkRes.json();

    // 转成 binary bytes
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

  // ── GET /api/seafile/download ───────────────────────────────────────────
  if (req.method === 'GET' && (pathname === '/download' || fullPath.endsWith('/download'))) {
    const result = await handleDownload(req.query);
    return res.status(result.status).json(result.body);
  }

  // ── POST /api/seafile/upload ────────────────────────────────────────────
  if (req.method === 'POST' && (pathname === '/upload' || fullPath.endsWith('/upload'))) {
    const result = await handleUpload(req.body || {});
    return res.status(result.status).json(result.body);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
