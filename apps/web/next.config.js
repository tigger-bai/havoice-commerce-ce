const path = require('path');

const contentSecurityPolicy = [
  "form-action 'self' https://payment-stage.ecpay.com.tw https://payment.ecpay.com.tw",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../..'),
  },
  transpilePackages: ['@havoice/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
