// Production build: bundles + minifies the JS and CSS into dist/ with hashed filenames.
// Usage: npm run build   (then deploy the dist/ folder, not the project root)
import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1. JavaScript: temporal-model (classic script) + the app module graph + three.js, as one file
const js = await build({
  stdin: {
    contents: "import './js/temporal-model.js';\nimport './js/app.js';\n",
    resolveDir: root,
    sourcefile: 'entry.js'
  },
  plugins: [
    {
      name: 'strip-query',
      setup(b) {
        b.onResolve({ filter: /^\..*\?/ }, (args) => ({
          path: path.resolve(args.resolveDir, args.path.split('?')[0])
        }));
      }
    }
  ],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  legalComments: 'eof', // keeps three.js's MIT licence notice
  write: false
});
const jsText = js.outputFiles[0].text;
const jsName = `app.${hash(jsText)}.js`;
await writeFile(path.join(dist, jsName), jsText);

// 2. CSS
const cssSource = await readFile(path.join(root, 'styles.css'), 'utf8');
const cssText = (await transform(cssSource, { loader: 'css', minify: true })).code;
const cssName = `styles.${hash(cssText)}.css`;
await writeFile(path.join(dist, cssName), cssText);

// 3. HTML: point at the hashed files, minify inline <style>/<script>, strip comments + indentation
async function replaceAsync(text, pattern, fn) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    parts.push(text.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts.join('');
}

async function buildHtml(file, rewrite = (html) => html) {
  let html = rewrite(await readFile(path.join(root, file), 'utf8'));

  html = await replaceAsync(html, /<style>([\s\S]*?)<\/style>/g, async (_, css) =>
    `<style>${(await transform(css, { loader: 'css', minify: true })).code.trim()}</style>`
  );
  html = await replaceAsync(html, /<script>([\s\S]*?)<\/script>/g, async (_, code) =>
    `<script>${(await transform(code, { loader: 'js', minify: true, target: 'es2020' })).code.trim()}</script>`
  );

  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  await writeFile(path.join(dist, file), html + '\n');
}

function mustReplace(html, from, to) {
  const matched = typeof from === 'string' ? html.includes(from) : from.test(html);
  if (!matched) throw new Error(`build: expected to find ${from}`);
  return html.replace(from, to);
}

await buildHtml('index.html', (html) => {
  html = mustReplace(html, /<link rel="stylesheet" href="styles\.css(?:\?[^"]*)?">/, `<link rel="stylesheet" href="${cssName}">`);
  html = mustReplace(html, '<script defer src="js/temporal-model.js"></script>', '');
  html = mustReplace(html, /<script type="module" src="js\/app\.js(?:\?[^"]*)?"><\/script>/, `<script type="module" src="${jsName}"></script>`);
  return html;
});
await buildHtml('experience.html');

// 4. Static assets (textures)
await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`dist/${jsName}   ${kb(Buffer.byteLength(jsText))}`);
console.log(`dist/${cssName}  ${kb(Buffer.byteLength(cssText))}`);
console.log('dist/index.html, dist/experience.html, dist/assets/');
