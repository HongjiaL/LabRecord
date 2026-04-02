import { supabase } from '../../../supabase';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { supabaseUrl, supabaseAnonKey } = process.env;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(200).json({
      configured: false,
      error: 'Vercel 尚未配置 Supabase 环境变量'
    });
  }

  return res.status(200).json({
    configured: true,
    ok: true,
    message: '已连接到 Supabase 云存储'
  });
}
