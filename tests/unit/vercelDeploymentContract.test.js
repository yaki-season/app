import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readJson = (relativePath) => JSON.parse(readFileSync(
  new URL(`../../${relativePath}`, import.meta.url),
  'utf8',
));

describe('Vercel deployment contract', () => {
  const config = readJson('vercel.json');
  const packageJson = readJson('package.json');

  it('builds the Vite app into the configured static output directory', () => {
    expect(config.framework).toBe('vite');
    expect(config.installCommand).toBe('npm ci');
    expect(config.buildCommand).toBe('npm run build');
    expect(config.outputDirectory).toBe('dist');
    expect(packageJson.engines.node).toBe('24.x');
  });

  it('serves the public shell at the site root and preserves legacy paths', () => {
    expect(config.rewrites).toEqual(expect.arrayContaining([
      { source: '/', destination: '/public-shell.html' },
      { source: '/src/:path*', destination: '/:path*' },
      { source: '/public/:path*', destination: '/:path*' },
    ]));
  });

  it('sets baseline security and asset cache headers', () => {
    expect(config.headers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: '/(.*)',
        headers: expect.arrayContaining([
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ]),
      }),
      expect.objectContaining({
        source: '/assets/(.*)',
        headers: expect.arrayContaining([
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ]),
      }),
    ]));
  });
});
