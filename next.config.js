/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['node-zklib'],
  output: 'standalone',
}

module.exports = nextConfig
