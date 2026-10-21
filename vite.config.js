import { defineConfig } from 'vite';

// Inline the (small) stylesheet into index.html so first paint needs no extra round trip.
function inlineCss() {
  return {
    name: 'aixm-inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName === 'index.html');
      if (!html) return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (!name.endsWith('.css')) continue;
        const at = source.indexOf(`href="/${name}"`);
        if (at < 0) continue;
        const start = source.lastIndexOf('<link', at);
        const end = source.indexOf('>', at) + 1;
        source = source.slice(0, start) + `<style>${String(file.source).trim()}</style>` + source.slice(end);
        delete bundle[name];
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  plugins: [inlineCss()],
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    sourcemap: true,
    modulePreload: { polyfill: false },
    // three.js ships in the lazily imported WebGL chunk; warn only if it balloons.
    chunkSizeWarningLimit: 700,
  },
});
