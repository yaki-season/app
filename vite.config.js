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

function publicEntryAndLegacyPathCompatibility() {
  const rewrite = (request, _response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/' || url.pathname === '/index.html'
      || url.pathname === '/src' || url.pathname === '/src/') {
      request.url = `/public-shell.html${url.search}`;
    } else if (url.pathname.startsWith('/src/')) {
      request.url = `${url.pathname.slice(4)}${url.search}`;
    } else if (url.pathname === '/public') {
      request.url = `/${url.search}`;
    } else if (url.pathname.startsWith('/public/')) {
      request.url = `${url.pathname.slice(7)}${url.search}`;
    }
    next();
  };
  return {
    name: 'public-entry-and-legacy-path-compatibility',
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
  // 공개 루트와 기존 /src/*.html·/public/assets/* 북마크를 함께 유지한다.
  plugins: [contentRuntimeFiles(), publicEntryAndLegacyPathCompatibility()],
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
