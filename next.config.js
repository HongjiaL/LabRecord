/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // SPA: 所有页面都由 index.html（hash 路由）接管
  async rewrites() {
    return [
      {
        source: '/((?!api|_next/static|_next/image|favicon.ico|main.css|settings-modal.js|app.js).*)',
        destination: '/index.html',
      },
    ];
  },
}

module.exports = nextConfig
