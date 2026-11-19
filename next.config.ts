import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  // libsql is a native module; keep it outside the server bundle and make sure
  // Vercel traces its platform-specific binary into the serverless function.
  serverExternalPackages: ['libsql'],
  outputFileTracingIncludes: {
    '/*': ['./node_modules/libsql/**/*', './node_modules/@libsql/**/*'],
  },
  // Production uses libSQL/Turso. Keep local development database files out of
  // the serverless function bundle, where they would be read-only anyway.
  outputFileTracingExcludes: {
    '/*': ['./app/data/**/*', './data/**/*'],
  },
};
export default nextConfig;
