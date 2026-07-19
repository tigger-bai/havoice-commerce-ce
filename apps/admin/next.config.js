const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../..'),
  },
  transpilePackages: ['@havoice/shared'],
};

module.exports = nextConfig;
