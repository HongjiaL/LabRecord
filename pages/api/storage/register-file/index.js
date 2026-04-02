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

  /** Same safe-name logic as settings-modal.js _storageSafeFileName (strips Chinese / special chars) */
  function _safeName(raw) {
    const dot = raw.lastIndexOf('.');
    const extRaw = dot >= 0 ? raw.slice(dot + 1) : '';
    const ext = extRaw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12) || 'bin';
    let base = (dot >= 0 ? raw.slice(0, dot) : raw).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (base.length < 1 || base.length > 180) {
      let h = 0;
      for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
      base = 'f' + (h >>> 0).toString(16) + '_' + Date.now().toString(36);
    }
    return `${base}.${ext}`.length > 200 ? `${base.slice(0, 160)}.${ext}` : `${base}.${ext}`;
  }

  const safeName = _safeName(String(fileName || 'file'));
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
