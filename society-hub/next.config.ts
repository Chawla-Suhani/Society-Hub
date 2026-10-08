import type { NextConfig } from 'next';

const config: NextConfig = {
  // Native or file-reading packages stay outside the bundle and are loaded by Node at runtime.
  serverExternalPackages: ['pdfkit', 'better-sqlite3', '@prisma/adapter-better-sqlite3'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
