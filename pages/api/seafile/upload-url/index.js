const SEAFILE_BASE_V1 = 'https://box.nju.edu.cn/api2';
const SEAFILE_BASE_V2 = 'https://box.nju.edu.cn/api/v2.1';

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
    // 检查目录是否存在
    const checkRes = await fetch(
      `${SEAFILE_BASE_V1}/repos/${repoId}/dir/?p=${encodeURIComponent(dirPath)}`,
      { headers: { 'Authorization': `Token ${token}`, 'Accept': 'application/json' } }
    );
    if (!checkRes.ok) {
      const errText = await checkRes.text();
      return res.status(checkRes.status).json({ ok: false, error: `检查目录失败 (HTTP ${checkRes.status}): ${errText}` });
    }

    return res.status(200).json({ ok: true, repoId, token, dirPath });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || '网络错误' });
  }
}
