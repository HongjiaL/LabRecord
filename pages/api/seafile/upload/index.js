const SEAFILE_BASE_V1 = 'https://box.nju.edu.cn/api2';
const SEAFILE_BASE_V2 = 'https://box.nju.edu.cn/api/v2.1';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.SEAFILE_TOKEN;
  const repoId = process.env.SEAFILE_REPO_ID;
  if (!token || !repoId) {
    return res.status(500).json({ ok: false, error: '南大云盘未配置' });
  }

  const { fileName, meetingId, base64 } = req.body;
  if (!fileName || !meetingId || !base64) {
    return res.status(400).json({ ok: false, error: '缺少 fileName、meetingId 或 base64 参数' });
  }

  const dirPath = `/${meetingId}`;
  const filePath = `${dirPath}/${fileName}`;

  try {
    // 将 base64 解码为 Buffer
    const binaryStr = Buffer.from(base64, 'base64').toString('binary');
    const fileBuffer = Buffer.from(binaryStr, 'binary');

    // Seafile v1 API：直接上传文件
    // 先获取上传链接
    const linkRes = await fetch(
      `${SEAFILE_BASE_V1}/repos/${repoId}/upload-link/?p=${encodeURIComponent(dirPath)}`,
      { headers: { 'Authorization': `Token ${token}`, 'Accept': 'application/json' } }
    );

    if (!linkRes.ok) {
      const errText = await linkRes.text();
      return res.status(linkRes.status).json({ ok: false, error: `获取上传链接失败 (HTTP ${linkRes.status}): ${errText}` });
    }

    let uploadUrl;
    try {
      uploadUrl = await linkRes.json();
    } catch {
      const errText = await linkRes.text();
      return res.status(500).json({ ok: false, error: `Seafile 上传链接接口返回非 JSON: ${errText.slice(0, 200)}` });
    }

    // 补全协议前缀
    if (!uploadUrl.startsWith('http')) {
      uploadUrl = `${SEAFILE_BASE_V1.replace('/api2', '')}${uploadUrl}`;
    }

    // 构造 multipart/form-data 上传
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, fileName);
    formData.append('parent_dir', dirPath);
    formData.append('replace', '1');

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Authorization': `Token ${token}` },
      body: formData
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return res.status(uploadRes.status).json({ ok: false, error: `Seafile 上传失败 (HTTP ${uploadRes.status}): ${errText}` });
    }

    // Seafile 返回的是文件路径文本（非 JSON）
    const responseText = await uploadRes.text();

    return res.status(200).json({ ok: true, path: filePath, rawResponse: responseText });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || '网络错误' });
  }
}
