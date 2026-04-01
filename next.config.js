/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // 明确排除 api/ 目录中的 .js 文件，避免 TypeScript/Webpack 处理
  webpack: (config, { isServer }) => {
    // pages/api/ 目录由 Next.js 直接处理为 serverless functions
    return config;
  },
  async rewrites() {
    return [
      {
        // 非 Next.js 保留路径的请求都交给静态 index.html（SPA）
        source: '/((?!api|_next|_ipc).*)',
        destination: '/index.html',
      },
    ];
  },
}

module.exports = nextConfig
