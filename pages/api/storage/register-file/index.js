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
    return res.status(503).json({ ok: false, error: 'Supabase 未配置' });
  }

  const { fileName, meetingId, fileSize } = req.body || {};
  if (!fileName || !meetingId) {
    return res.status(400).json({ ok: false, error: '缺少 fileName 或 meetingId' });
  }

  const safeName = String(fileName).replace(/[/\\]/g, '_');
  const filePath = `${meetingId}/${safeName}`;
  const size = typeof fileSize === 'number' && fileSize >= 0 ? fileSize : null;

  try {
    await supabase.from('meeting_files').insert({
      meeting_id: meetingId,
      file_name: safeName,
      file_path: filePath,
      file_size: size,
    });
    return res.status(200).json({ ok: true, path: filePath });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || '登记失败' });
  }
}
