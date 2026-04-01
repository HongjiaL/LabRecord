const SEAFILE_BASE = 'https://box.nju.edu.cn/api2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.SEAFILE_TOKEN;
  if (!token) {
    return res.status(200).json({ configured: false, error: 'Vercel 尚未配置 SEAFILE_TOKEN 环境变量' });
  }

  try {
    const res2 = await fetch(`${SEAFILE_BASE}/repos/`, {
      headers: { 'Authorization': `Token ${token}`, 'Accept': 'application/json' }
    });
    if (!res2.ok) {
      const text = await res2.text();
      return res.status(200).json({ configured: true, ok: false, error: `连接失败 (HTTP ${res2.status}): ${text}` });
    }
    const data = await res2.json();
    const repos = data.map((r) => ({ id: r.id, name: r.name }));
    const repoId = process.env.SEAFILE_REPO_ID;
    const currentRepo = repos.find((r) => r.id === repoId);
    return res.status(200).json({
      configured: true, ok: true, repos,
      currentRepoId: repoId || null,
      currentRepoName: currentRepo ? currentRepo.name : null
    });
  } catch (err) {
    return res.status(200).json({ configured: true, ok: false, error: err.message || '网络错误' });
  }
}
