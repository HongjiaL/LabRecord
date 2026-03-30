import { supabase } from '../../supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return handleUpload(req, res);
  }

  res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpload(req, res) {
  try {
    const { base64Content, fileName, meetingId } = req.body;

    if (!base64Content || !fileName || !meetingId) {
      return res.status(400).json({ error: 'base64Content, fileName, and meetingId are required' });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'GitHub Token not configured on server' });
    }

    const owner = 'HongjiaL';
    const repo = 'LabRecord';
    const branch = 'token';
    const path = `uploads/${meetingId}/${fileName}`;
    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents`;

    // Check if file already exists to get SHA for update
    let sha = null;
    try {
      const getRes = await fetch(`${apiBase}/${path}?ref=${branch}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (getRes.ok) {
        const data = await getRes.json();
        sha = data.sha;
      }
    } catch (_) { /* file doesn't exist yet */ }

    const body = {
      message: `Upload: ${fileName} (meeting: ${meetingId})`,
      content: base64Content,
      branch
    };
    if (sha) body.sha = sha;

    const res_ = await fetch(`${apiBase}/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify(body)
    });

    if (!res_.ok) {
      const err = await res_.json().catch(() => ({}));
      return res.status(res_.status).json({ error: `Upload failed: ${err.message || res_.status}` });
    }

    const data = await res_.json();
    return res.status(200).json({
      sha: data.content.sha,
      path: data.content.path,
      downloadUrl: data.content.download_url
    });
  } catch (err) {
    console.error('[POST /api/files/upload]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
