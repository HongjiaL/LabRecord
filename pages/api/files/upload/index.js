function checkAppPassword(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return null;
  const provided = req.headers['x-app-password'];
  if (!provided) return { status: 401, body: { error: 'Unauthorized: password required. Send X-App-Password header.' } };
  if (provided !== expected) return { status: 403, body: { error: 'Forbidden: incorrect password.' } };
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Password');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authError = checkAppPassword(req);
  if (authError) return res.status(authError.status).json(authError.body);

  const { fileName, meetingId } = req.body || {};
  if (!fileName || !meetingId) return res.status(400).json({ error: 'fileName and meetingId are required' });

  const masterToken = process.env.GITHUB_TOKEN;
  if (!masterToken) return res.status(500).json({ error: 'GitHub Token not configured on server' });

  const owner = 'HongjiaL';
  const repo = 'LabRecord';
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
      content: '{{BASE64_CONTENT}}',
      branch: 'token',
      ...(sha ? { sha } : {})
    },
    sha,
    note: 'token有效期内（约10分钟）请尽快完成上传'
  });
}
