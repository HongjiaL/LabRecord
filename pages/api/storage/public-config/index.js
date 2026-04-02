const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ ok: false, error: 'Supabase 未配置' });
  }

  // anon key 配合 Storage RLS 使用，与常见 Supabase 前端用法一致（勿暴露 service_role）
  return res.status(200).json({ ok: true, url: supabaseUrl, anonKey: supabaseAnonKey });
}
