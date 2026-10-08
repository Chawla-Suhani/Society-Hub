import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Providers from '@/components/Providers';
import { getAuth } from '@/lib/server-auth';

export const metadata: Metadata = {
  title: 'Society Hub',
  description: 'Visitors, bills, complaints and notices for your society.',
};

export const viewport: Viewport = { themeColor: '#14212b', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Reads the signed-in user on the server, so the first paint already knows who you are (no "loading" flash).
export default async function RootLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers initialUser={auth.kind === 'user' ? auth.me : null}>{children}</Providers>
      </body>
    </html>
  );
}
