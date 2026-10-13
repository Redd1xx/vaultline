import wasm from 'vite-plugin-wasm';

// Zurich Custody Console bundler configuration
export default {
  base: './',
  plugins: [wasm()],
  esbuild: { target: 'es2022' },
  build: { target: 'es2022', outDir: '../dist', emptyOutDir: true },
  optimizeDeps: { exclude: ['@midnightntwrk/onchain-runtime-v4'], esbuildOptions: { target: 'es2022' } },
  server: { fs: { allow: ['..'] } },
};
