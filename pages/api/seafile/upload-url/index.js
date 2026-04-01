const SEAFILE_BASE = 'https://box.nju.edu.cn/api2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.SEAFILE_TOKEN;
  const repoId = process.env.SEAFILE_REPO_ID;
  if (!token || !repoId) {
    return res.status(500).json({ ok: false, error: '南大云盘未配置（请在 Vercel 设置 SEAFILE_TOKEN 和 SEAFILE_REPO_ID）' });
  }

  const { meetingId } = req.query;
  if (!meetingId) {
    return res.status(400).json({ ok: false, error: '缺少 meetingId 参数' });
  }

  const dirPath = `/${meetingId}`;

  try {
    // 确保目录存在
    const checkRes = await fetch(
      `${SEAFILE_BASE}/repos/${repoId}/dir/?p=${encodeURIComponent(dirPath)}`,
      { headers: { 'Authorization': `Token ${token}`, 'Accept': 'application/json' } }
    );
    if (!checkRes.ok) {
      const errText = await checkRes.text();
      return res.status(checkRes.status).json({ ok: false, error: `检查目录失败 (HTTP ${checkRes.status}): ${errText}` });
    }

    // 获取 Seafile 上传链接
    const linkRes = await fetch(
      `${SEAFILE_BASE}/repos/${repoId}/upload-link/?p=${encodeURIComponent(dirPath)}`,
      { headers: { 'Authorization': `Token ${token}`, 'Accept': 'application/json' } }
    );
    if (!linkRes.ok) {
      const errText = await linkRes.text();
      return res.status(linkRes.status).json({ ok: false, error: `获取上传链接失败 (HTTP ${linkRes.status}): ${errText}` });
    }
    let uploadUrl;
    try {
      const raw = await linkRes.json();
      uploadUrl = raw;
    } catch {
      const errText = await linkRes.text();
      return res.status(500).json({ ok: false, error: `Seafile 返回了非 JSON 响应 (HTTP ${linkRes.status}): ${errText.slice(0, 200)}` });
    }
    if (!uploadUrl.startsWith('http')) {
      uploadUrl = SEAFILE_BASE.replace('/api2', '') + uploadUrl;
    }

    return res.status(200).json({
      ok: true, uploadUrl, token, uploadDir: dirPath,
      seafileOrigin: SEAFILE_BASE.replace('/api2', '')
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || '网络错误' });
  }
}
