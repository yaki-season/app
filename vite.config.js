import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const sourceRoot = resolve(import.meta.dirname, 'src');
const htmlEntries = Object.fromEntries(
  readdirSync(sourceRoot)
    .filter((name) => name.endsWith('.html'))
    .map((name) => [name.slice(0, -5), resolve(sourceRoot, name)]),
);

export default defineConfig({
  root: sourceRoot,
  publicDir: resolve(import.meta.dirname, 'public'),
  resolve: {
    alias: [{
      find: /^\/node_modules\//,
      replacement: `${resolve(import.meta.dirname, 'node_modules')}/`,
    }],
  },
  build: {
    target: 'esnext',
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: htmlEntries },
  },
});
