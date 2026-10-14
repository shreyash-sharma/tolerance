import './globals.css';
import type { Metadata } from 'next';
import { Barlow } from 'next/font/google';
import localFont from 'next/font/local';

const geistSans = localFont({ src: './fonts/GeistVF.woff', variable: '--font-geist-sans' });
const geistMono = localFont({ src: './fonts/GeistMonoVF.woff', variable: '--font-geist-mono' });
const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-barlow', display: 'swap' });

export const metadata: Metadata = { title: { default: 'Tolerance', template: '%s · Tolerance' }, description: 'Operations workspace for a plant: connect data, understand it, compile it, operate it.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${barlow.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
