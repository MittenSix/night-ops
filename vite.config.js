import { cp, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = new URL('.', import.meta.url).pathname;

function copyLegacyAssets() {
  return {
    name: 'night-ops-legacy-assets',
    async closeBundle() {
      const output = resolve(root, 'dist');
      await mkdir(output, { recursive: true });
      await Promise.all([
        copyFile(resolve(root, 'app.js'), resolve(output, 'app.js')),
        copyFile(resolve(root, 'improvements.js'), resolve(output, 'improvements.js')),
        copyFile(resolve(root, 'CNAME'), resolve(output, 'CNAME')),
        copyFile(resolve(root, 'manifest.webmanifest'), resolve(output, 'manifest.webmanifest')),
        copyFile(resolve(root, 'sw.js'), resolve(output, 'sw.js')),
        cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true })
      ]);
    }
  };
}

export default defineConfig({
  plugins: [copyLegacyAssets()],
  build: { outDir: 'dist', emptyOutDir: true }
});
