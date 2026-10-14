/** The browser talks to the FastAPI backend through /api (same origin), so cookies, CORS and the no-cache rules stay simple. */
const API = process.env.TOLERANCE_API || 'http://127.0.0.1:48410';
const STATIC = process.env.STATIC_EXPORT === '1';
export default {
  ...(STATIC ? { output: 'export', trailingSlash: true, images: { unoptimized: true } } : {}),
  reactStrictMode: false,
  // The Pascal packages ship TypeScript source with type errors of their own. Our code is checked by `npm run typecheck` (errors in node_modules are ignored there).
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ['@pascal-app/core', '@pascal-app/viewer', '@pascal-app/editor', '@pascal-app/nodes'],
  // In the container the backend serves the pages and the API on one port, so no proxy is needed.
  ...(STATIC ? {} : { async rewrites() { return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]; } }),
};
