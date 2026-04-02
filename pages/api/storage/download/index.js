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
    return res.status(503).json({
      ok: false,
      error: 'Supabase 环境变量未配置。请在 Vercel 项目设置中添加 SUPABASE_URL 和 SUPABASE_ANON_KEY。'
    });
  }

  const { fileName, meetingId } = req.query;
  if (!fileName || !meetingId) {
    return res.status(400).json({ ok: false, error: '缺少 fileName 或 meetingId 参数' });
  }

  async function tryDownload(name) {
    const { data, error } = await supabase.storage
      .from('meeting-files')
      .download(`${meetingId}/${name}`);
    if (!error && data) return data;
    return null;
  }

  try {
    // 1. Try the name as passed (works for newly saved records where pptFileName == stored name)
    let fileData = await tryDownload(fileName);

    // 2. Fallback: look up actual stored name from meeting_files table
    //    This fixes old records where pptFileName was the Chinese original but
    //    the safe name in the bucket differs (e.g. 3_28_2.pptx vs 文献分享3.28.pptx)
    if (!fileData) {
      const { data: row } = await supabase
        .from('meeting_files')
        .select('file_name')
        .eq('meeting_id', meetingId)
        .maybeSingle();
      if (row?.file_name) {
        fileData = await tryDownload(row.file_name);
      }
    }

    if (!fileData) {
      return res.status(404).json({
        ok: false,
        error: '文件未找到，请确认该文件已上传成功',
        status: 404
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const binaryStr = Buffer.from(arrayBuffer).toString('binary');
    const base64 = Buffer.from(binaryStr, 'binary').toString('base64');

    return res.status(200).json({ ok: true, content: base64 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || '网络错误' });
  }
}
