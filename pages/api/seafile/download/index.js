const SEAFILE_BASE = 'https://box.nju.edu.cn/api2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.SEAFILE_TOKEN;
  const repoId = process.env.SEAFILE_REPO_ID;
  if (!token || !repoId) {
    return res.status(500).json({ ok: false, error: '南大云盘未配置' });
  }

  const { fileName, meetingId } = req.query;
  if (!fileName || !meetingId) {
    return res.status(400).json({ ok: false, error: '缺少 fileName 或 meetingId' });
  }

  const filePath = `/${meetingId}/${fileName}`;
  try {
    const res2 = await fetch(
      `${SEAFILE_BASE}/repos/${repoId}/file/detail/?p=${encodeURIComponent(filePath)}`,
      { headers: { 'Authorization': `Token ${token}`, 'Accept': 'application/json' } }
    );
    if (!res2.ok) {
      return res.status(res2.status).json({ ok: false, error: `文件不存在或无权限 (HTTP ${res2.status})`, status: res2.status });
    }

    const rawUrl = `${SEAFILE_BASE}/repos/${repoId}/files/${encodeURIComponent(filePath)}/?raw=1`;
    const rawRes = await fetch(rawUrl, {
      headers: { 'Authorization': `Token ${token}`, 'Accept': 'application/octet-stream' }
    });
    if (!rawRes.ok) {
      return res.status(rawRes.status).json({ ok: false, error: `下载失败 (HTTP ${rawRes.status})`, status: rawRes.status });
    }
    const arrayBuffer = await rawRes.arrayBuffer();
    const binaryStr = Buffer.from(arrayBuffer).toString('binary');
    const base64 = Buffer.from(binaryStr, 'binary').toString('base64');
    return res.status(200).json({ ok: true, content: base64 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || '网络错误' });
  }
}
