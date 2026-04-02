import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ ok: false, error: 'Supabase 环境变量未配置' });
  }

  const { fileName, meetingId } = req.body || {};
  if (!fileName || !meetingId) {
    return res.status(400).json({ ok: false, error: '缺少 fileName 或 meetingId' });
  }

  const safeName = String(fileName).replace(/[/\\]/g, '_');
  const filePath = `${meetingId}/${safeName}`;

  let data;
  let error;
  try {
    const r1 = await supabase.storage
      .from('meeting-files')
      .createSignedUploadUrl(filePath, { upsert: true });
    data = r1.data;
    error = r1.error;
  } catch {
    error = { message: 'createSignedUploadUrl failed' };
  }

  if (error) {
    const r2 = await supabase.storage.from('meeting-files').createSignedUploadUrl(filePath);
    data = r2.data;
    error = r2.error;
  }

  if (error) {
    return res.status(500).json({ ok: false, error: error.message || '无法创建上传地址' });
  }

  return res.status(200).json({
    ok: true,
    path: data.path,
    token: data.token,
  });
}
