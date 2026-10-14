import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Source_Sans_3 } from 'next/font/google';
import { AuthProvider } from '@/providers/AuthProvider';
import './globals.css';

// Source Sans 3 is used for body text and the ExtraBold (800) headlines.
// JetBrains Mono covers eyebrows, labels, language codes, and numerics.
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-source-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Verba · Speaking practice',
  description: 'Practice speaking a foreign language with live AI voice conversations',
};

export const viewport: Viewport = {
  themeColor: '#f5f1e8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
