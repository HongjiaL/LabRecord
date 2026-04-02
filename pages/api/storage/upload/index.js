import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      ok: false,
      error: 'Supabase 环境变量未配置。请在 Vercel 项目设置中添加 SUPABASE_URL 和 SUPABASE_ANON_KEY。'
    });
  }

  const { fileName, meetingId, base64 } = req.body;
  if (!fileName || !meetingId || !base64) {
    return res.status(400).json({ ok: false, error: '缺少 fileName、meetingId 或 base64 参数' });
  }

  const filePath = `${meetingId}/${fileName}`;

  try {
    const fileBuffer = Buffer.from(base64, 'base64');

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('meeting-files')
      .upload(filePath, fileBuffer, {
        contentType: 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ ok: false, error: `上传失败: ${uploadError.message}` });
    }

    const { data: urlData } = supabase.storage
      .from('meeting-files')
      .getPublicUrl(filePath);

    await supabase.from('meeting_files').insert({
      meeting_id: meetingId,
      file_name: fileName,
      file_path: filePath,
      file_size: fileBuffer.length,
    });

    return res.status(200).json({
      ok: true,
      path: filePath,
      publicUrl: urlData.publicUrl
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || '网络错误' });
  }
}
