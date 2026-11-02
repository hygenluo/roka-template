/**
 * 字体覆盖检查：内容里出现了子集外的字，就在构建时提示。
 *
 * 不阻断构建——缺字只会回退到系统字体（难看但不致命），
 * 但必须在日志里说出来，否则你会以为皮肤突然变了。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHARS = path.join(ROOT, 'src', 'fonts', 'subset-chars.txt');

if (!existsSync(CHARS)) {
  console.warn('[check-fonts] 还没有字体子集，跳过（先跑 pnpm fonts:build）');
  process.exit(0);
}

const covered = new Set(readFileSync(CHARS, 'utf8'));
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.woff2', '.woff']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (!SKIP_EXT.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

const missing = new Map();
for (const dir of [path.join(ROOT, 'content'), path.join(ROOT, 'src')]) {
  for (const file of walk(dir)) {
    if (file.includes(path.join('src', 'data'))) continue;
    // CSS 注释不是页面上的字，去掉再比对
    const raw = readFileSync(file, 'utf8');
    const text = path.extname(file) === '.css' ? raw.replace(/\/\*[\s\S]*?\*\//g, '') : raw;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp < 0x20) continue;
      if (covered.has(ch)) continue;
      // 只关心非 ASCII（西文走 fontsource，不受子集影响）
      if (cp < 0x80) continue;
      if (!missing.has(ch)) missing.set(ch, new Set());
      missing.get(ch).add(path.relative(ROOT, file).split(path.sep).join('/'));
    }
  }
}

if (missing.size > 0) {
  console.warn(`[check-fonts] 有 ${missing.size} 个字不在字体子集里，会回退到系统字体：`);
  const list = [...missing.entries()].slice(0, 20);
  for (const [ch, files] of list) {
    console.warn(`  「${ch}」 ← ${[...files].slice(0, 2).join(', ')}`);
  }
  if (missing.size > 20) console.warn(`  …还有 ${missing.size - 20} 个`);
  console.warn('[check-fonts] 跑一次 `pnpm fonts:build` 重新生成子集即可。');
} else {
  console.log('[check-fonts] 字体覆盖完整');
}
