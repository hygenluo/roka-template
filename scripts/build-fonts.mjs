/**
 * 中文字体子集化（本地维护步骤，**不在 CI 里跑**）。
 *
 * 为什么不在构建时跑：需要 fonttools + 40MB 源字体，而 Cloudflare 构建镜像里都没有。
 * 所以产物（woff2 + CSS + 用字清单）是**提交进仓库**的，
 * 只有内容里出现了新字之后，才在本地跑一次 `pnpm fonts:build`。
 *
 * 漏字不会炸站：`check-fonts.mjs` 会在构建前提示还有哪些字没覆盖。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.fonts-cache');
const OUT_FONTS = path.join(ROOT, 'public', 'fonts');
const OUT_CSS = path.join(ROOT, 'src', 'styles', 'fonts-cjk.css');
const OUT_CHARS = path.join(ROOT, 'src', 'fonts', 'subset-chars.txt');

const BASE = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main';

const FACES = [
  { family: 'Noto Serif SC', weight: 400, out: 'noto-serif-sc-400.woff2', src: 'Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf' },
  { family: 'Noto Serif SC', weight: 700, out: 'noto-serif-sc-700.woff2', src: 'Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf' },
  { family: 'Noto Sans SC', weight: 400, out: 'noto-sans-sc-400.woff2', src: 'Sans/SubsetOTF/SC/NotoSansSC-Regular.otf' },
  { family: 'Noto Sans SC', weight: 500, out: 'noto-sans-sc-500.woff2', src: 'Sans/SubsetOTF/SC/NotoSansSC-Medium.otf' },
];

const SCAN_DIRS = [path.join(ROOT, 'content'), path.join(ROOT, 'src')];
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

/** 收集站点上可能出现的所有字符 */
function collectChars() {
  const set = new Set();

  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      // 生成产物里没有内容文字
      if (file.includes(path.join('src', 'data'))) continue;
      let text = readFileSync(file, 'utf8');
      setAdd(text, set);
    }
  }

  // ASCII 可打印 + 常见中英标点 + 空白，兜底
  for (let c = 32; c < 127; c++) set.add(String.fromCharCode(c));
  setAdd('　、。〈〉《》「」『』【】〔〕！＂＃％＆（）＊＋，－．／：；＜＝＞？＠［］＿｛｜｝～·—–…‰′″№℃　〇', set);

  return [...set].sort();
}

function setAdd(text, set) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    // 跳过控制字符
    if (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13) continue;
    set.add(ch);
  }
}

async function ensureSource(face) {
  const file = path.join(CACHE, path.basename(face.src));
  if (existsSync(file) && statSync(file).size > 1_000_000) return file;
  mkdirSync(CACHE, { recursive: true });
  const url = `${BASE}/${face.src}`;
  console.log(`[fonts] 下载 ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// ---------- 主流程 ----------

mkdirSync(OUT_FONTS, { recursive: true });
mkdirSync(path.dirname(OUT_CHARS), { recursive: true });

const chars = collectChars();
writeFileSync(OUT_CHARS, chars.join(''));
const textFile = path.join(CACHE, 'chars.txt');
mkdirSync(CACHE, { recursive: true });
writeFileSync(textFile, chars.join(''));

console.log(`[fonts] 用字 ${chars.length} 个（含 ASCII 与标点）`);

for (const face of FACES) {
  const source = await ensureSource(face);
  const target = path.join(OUT_FONTS, face.out);

  execFileSync(
    'pyftsubset',
    [
      source,
      `--text-file=${textFile}`,
      '--flavor=woff2',
      '--layout-features=kern,liga,clig,calt',
      '--no-hinting',
      '--desubroutinize',
      '--name-IDs=*',
      '--drop-tables+=DSIG',
      `--output-file=${target}`,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );

  const kb = (statSync(target).size / 1024).toFixed(1);
  console.log(`[fonts] ${face.out.padEnd(26)} ${kb} KB`);
}

const css = `/* 由 scripts/build-fonts.mjs 生成，请勿手改。改字号/字重请改 FACES 列表后重跑 pnpm fonts:build */

${FACES.map(
  (f) => `@font-face {
  font-family: "${f.family}";
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url("/fonts/${f.out}") format("woff2");
}`
).join('\n\n')}
`;

writeFileSync(OUT_CSS, css);

const total = FACES.reduce((n, f) => n + statSync(path.join(OUT_FONTS, f.out)).size, 0);
console.log(`[fonts] 合计 ${(total / 1024).toFixed(0)} KB，CSS 写入 src/styles/fonts-cjk.css`);
