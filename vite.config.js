import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { defineConfig } from 'vite';

const sourceRoot = resolve(import.meta.dirname, 'src');
const contentRoot = resolve(import.meta.dirname, 'content');
const htmlEntries = Object.fromEntries(
  readdirSync(sourceRoot)
    .filter((name) => name.endsWith('.html'))
    .map((name) => [name.slice(0, -5), resolve(sourceRoot, name)]),
);

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    return entry.isDirectory() ? collectFiles(absolutePath) : [absolutePath];
  });
}

const contentFiles = collectFiles(contentRoot);

function contentRuntimeFiles() {
  const serveContent = (request, response, next) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (!pathname.startsWith('/content/')) {
      next();
      return;
    }
    const relativePath = pathname.slice('/content/'.length);
    const absolutePath = resolve(contentRoot, relativePath);
    const insideContentRoot = absolutePath === contentRoot
      || absolutePath.startsWith(`${contentRoot}${sep}`);
    if (!insideContentRoot) {
      response.statusCode = 403;
      response.end();
      return;
    }
    try {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(readFileSync(absolutePath));
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
        next();
        return;
      }
      next(error);
    }
  };

  return {
    name: 'content-runtime-files',
    configureServer(server) {
      server.middlewares.use(serveContent);
    },
    generateBundle() {
      for (const absolutePath of contentFiles) {
        this.emitFile({
          type: 'asset',
          fileName: `content/${relative(contentRoot, absolutePath).split(sep).join('/')}`,
          source: readFileSync(absolutePath),
        });
      }
    },
  };
}

function legacyPathCompatibility() {
  const rewrite = (request, _response, next) => {
    if (request.url === '/src') request.url = '/';
    else if (request.url?.startsWith('/src/')) request.url = request.url.slice(4);
    if (request.url === '/public') request.url = '/';
    else if (request.url?.startsWith('/public/')) request.url = request.url.slice(7);
    next();
  };
  return {
    name: 'legacy-path-compatibility',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  root: sourceRoot,
  publicDir: resolve(import.meta.dirname, 'public'),
  // 기존 /src/*.html 북마크와 /public/assets/* 런타임 요청을 root 변경 뒤에도 유지한다.
  plugins: [contentRuntimeFiles(), legacyPathCompatibility()],
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
