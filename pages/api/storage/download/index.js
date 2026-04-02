import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ ok: false, error: 'Supabase 未配置' });
  }

  const { fileName, meetingId } = req.query;
  if (!fileName || !meetingId) {
    return res.status(400).json({ ok: false, error: '缺少 fileName 或 meetingId 参数' });
  }

  const filePath = `${meetingId}/${fileName}`;

  try {
    const { data, error } = await supabase.storage
      .from('meeting-files')
      .download(filePath);

    if (error || !data) {
      return res.status(404).json({
        ok: false,
        error: `文件不存在 (HTTP 404): ${error?.message || ''}`,
        status: 404
      });
    }

    const arrayBuffer = await data.arrayBuffer();
    const binaryStr = Buffer.from(arrayBuffer).toString('binary');
    const base64 = Buffer.from(binaryStr, 'binary').toString('base64');

    return res.status(200).json({ ok: true, content: base64 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || '网络错误' });
  }
}
