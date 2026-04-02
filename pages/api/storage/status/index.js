import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      configured: false,
      error: 'Supabase 环境变量未配置。请在 Vercel 项目设置中添加 SUPABASE_URL 和 SUPABASE_ANON_KEY。'
    });
  }

  return res.status(200).json({
    configured: true,
    ok: true,
    message: '已连接到 Supabase 云存储'
  });
}
