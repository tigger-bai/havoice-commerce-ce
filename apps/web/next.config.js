/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@havoice/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
