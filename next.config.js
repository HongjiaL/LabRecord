/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/((?!api|_next|_ipc).*)',
        destination: '/index.html',
      },
    ];
  },
}

module.exports = nextConfig
