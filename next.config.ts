import withSerwistInit from '@serwist/next';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

const isDev = process.env.NODE_ENV === 'development';

// Skip the Serwist Webpack plugin in dev so Turbopack can be used
let config: NextConfig;
if (isDev) {
  config = nextConfig;
} else {
  const withSerwist = withSerwistInit({
    swSrc: 'src/app/sw.ts',
    swDest: 'public/sw.js',
  });
  config = withSerwist(nextConfig);
}

export default config;
