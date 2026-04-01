export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { meetingId, fileName } = req.query;
  if (!meetingId || !fileName) return res.status(400).json({ error: 'meetingId and fileName are required' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GitHub Token not configured on server' });

  const owner = 'HongjiaL';
  const repo = 'LabRecord';
  const branch = 'token';
  const path = `uploads/${meetingId}/${fileName}`;
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const url = `${apiBase}/${path}?ref=${branch}`;

  try {
    const ghRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!ghRes.ok) return res.status(ghRes.status).json({ error: `GitHub API error: ${ghRes.status}` });

    const data = await ghRes.json();
    let base64 = (data.content && String(data.content).trim())
      ? String(data.content).replace(/\s/g, '') : '';

    if (!base64 && data.sha) {
      const blobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${data.sha}`;
      const blobRes = await fetch(blobUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (!blobRes.ok) return res.status(blobRes.status).json({ error: `Blob API error: ${blobRes.status}` });
      const blobData = await blobRes.json();
      if (blobData.encoding !== 'base64' || !blobData.content) return res.status(500).json({ error: 'Cannot read file binary content' });
      base64 = String(blobData.content).replace(/\s/g, '');
    }

    if (!base64) return res.status(404).json({ error: 'File content not found' });

    return res.status(200).json({ ok: true, content: base64 });
  } catch (err) {
    console.error('[GET /api/files/download]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
