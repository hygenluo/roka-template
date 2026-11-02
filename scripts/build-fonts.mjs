/**
 * 字体子集化（本地维护步骤，**不在 CI 里跑**）。
 *
 * 六个声音，各司其职：
 *   Smiley Sans      标题 —— 窄身、带速度感
 *   Noto Serif SC    教程正文 —— 长文耐读
 *   LXGW WenKai      随笔正文 —— 手记气质
 *   Noto Sans SC     UI / 标签
 *   Newsreader       日期与数字（含斜体）
 *   JetBrains Mono   代码
 *
 * 中文按"站点实际用字"子集化；西文按 unicode 区段子集化（以后写英文不会缺字）。
 *
 * 为什么不放进 CI：需要 fonttools + 上百 MB 源字体，Cloudflare 构建镜像里都没有。
 * 产物（public/fonts + src/styles/fonts.css + 用字清单）提交进仓库。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.fonts-cache');
const OUT_FONTS = path.join(ROOT, 'public', 'fonts');
const OUT_CSS = path.join(ROOT, 'src', 'styles', 'fonts.css');
const OUT_CHARS = path.join(ROOT, 'src', 'fonts', 'subset-chars.txt');

const NOTO = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main';
const GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl';

// 西文只保留拉丁区段：以后写英文、数字、标点都不会缺字
const LATIN_UNICODES =
  'U+0020-007E,U+00A0-00FF,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-214F,U+2190-21BB,U+2200-22FF';

const FACES = [
  // ---- 中文：按实际用字子集 ----
  { family: 'Smiley Sans', weight: 400, out: 'smiley-400.woff2', cjk: true, smiley: true },
  { family: 'Noto Serif SC', weight: 400, out: 'noto-serif-sc-400.woff2', cjk: true,
    url: `${NOTO}/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf` },
  { family: 'Noto Serif SC', weight: 700, out: 'noto-serif-sc-700.woff2', cjk: true,
    url: `${NOTO}/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf` },
  { family: 'LXGW WenKai', weight: 400, out: 'wenkai-400.woff2', cjk: true,
    url: 'https://github.com/lxgw/LxgwWenKai/releases/download/v1.520/LXGWWenKai-Regular.ttf' },
  { family: 'Noto Sans SC', weight: 400, out: 'noto-sans-sc-400.woff2', cjk: true,
    url: `${NOTO}/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf` },
  { family: 'Noto Sans SC', weight: 500, out: 'noto-sans-sc-500.woff2', cjk: true,
    url: `${NOTO}/Sans/SubsetOTF/SC/NotoSansSC-Medium.otf` },

  // ---- 西文：按区段子集 ----
  { family: 'Newsreader', weight: 400, style: 'normal', out: 'newsreader-400.woff2', cjk: false,
    url: `${GF}/newsreader/Newsreader%5Bopsz%2Cwght%5D.ttf` },
  { family: 'Newsreader', weight: 400, style: 'italic', out: 'newsreader-italic.woff2', cjk: false,
    url: `${GF}/newsreader/Newsreader-Italic%5Bopsz%2Cwght%5D.ttf` },
  { family: 'JetBrains Mono', weight: 400, out: 'jetbrains-mono-400.woff2', cjk: false,
    url: `${GF}/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf` },
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

/** CSS 里的注释不是"页面上的字"，去掉再算 */
function textOf(file) {
  const raw = readFileSync(file, 'utf8');
  return path.extname(file) === '.css' ? raw.replace(/\/\*[\s\S]*?\*\//g, '') : raw;
}

/** 收集站点上可能出现的所有字符 */
function collectChars() {
  const set = new Set();
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      if (file.includes(path.join('src', 'data'))) continue;
      if (file.includes(path.join('src', 'fonts'))) continue;
      if (path.basename(file) === 'fonts.css') continue; // 生成物
      for (const ch of textOf(file)) set.add(ch);
    }
  }
  // ASCII 可打印 + 常见中英标点，兜底
  for (let c = 32; c < 127; c++) set.add(String.fromCharCode(c));
  for (const ch of '　、。〈〉《》「」『』【】〔〕！＂＃％＆（）＊＋，－．／：；＜＝＞？＠［］＿｛｜｝～·—–…‰′″№℃〇') set.add(ch);

  // 去掉控制字符与 BOM
  return [...set]
    .filter((ch) => {
      const cp = ch.codePointAt(0);
      return cp >= 32 || cp === 9 || cp === 10 || cp === 13;
    })
    .sort();
}

async function download(url, file) {
  mkdirSync(CACHE, { recursive: true });
  console.log(`[fonts] 下载 ${url.split('/').slice(-2).join('/')}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function ensureSmiley() {
  const otf = path.join(CACHE, 'smiley', 'SmileySans-Oblique.otf');
  if (existsSync(otf)) return otf;

  const zip = path.join(CACHE, 'smiley.zip');
  if (!existsSync(zip)) {
    await download(
      'https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip',
      zip
    );
  }
  mkdirSync(path.dirname(otf), { recursive: true });
  execFileSync('python', [
    '-c',
    `import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])`,
    zip,
    path.dirname(otf),
  ], { stdio: 'inherit' });

  if (!existsSync(otf)) throw new Error('Smiley Sans 解压后找不到 OTF');
  return otf;
}

async function ensureSource(face) {
  if (face.smiley) return ensureSmiley();
  const file = path.join(CACHE, face.url.split('/').pop());
  if (existsSync(file) && statSync(file).size > 100_000) return file;
  await download(face.url, file);
  return file;
}

// ---------- 主流程 ----------

mkdirSync(OUT_FONTS, { recursive: true });
mkdirSync(path.dirname(OUT_CHARS), { recursive: true });
mkdirSync(CACHE, { recursive: true });

const chars = collectChars();
writeFileSync(OUT_CHARS, chars.join(''));
const textFile = path.join(CACHE, 'chars.txt');
writeFileSync(textFile, chars.join(''));

console.log(`[fonts] 用字 ${chars.length} 个`);

const built = [];
for (const face of FACES) {
  const source = await ensureSource(face);
  const target = path.join(OUT_FONTS, face.out);

  const args = [
    source,
    '--flavor=woff2',
    '--no-hinting',
    '--desubroutinize',
    '--name-IDs=*',
    '--drop-tables+=DSIG',
  ];
  if (face.cjk) {
    args.push(`--text-file=${textFile}`, '--layout-features=kern,liga,clig,calt');
  } else {
    args.push(`--unicodes=${LATIN_UNICODES}`, '--layout-features=kern,liga,clig,calt,tnum,zero');
  }
  args.push(`--output-file=${target}`);

  execFileSync('pyftsubset', args, { stdio: ['ignore', 'ignore', 'pipe'] });

  const kb = +(statSync(target).size / 1024).toFixed(1);
  built.push({ ...face, kb });
  console.log(`[fonts] ${face.out.padEnd(26)} ${kb} KB`);
}

const css = `/* 由 scripts/build-fonts.mjs 生成，请勿手改。
   改字体请改脚本里的 FACES，然后重跑 pnpm fonts:build */

${built
  .map(
    (f) => `@font-face {
  font-family: "${f.family}";
  font-style: ${f.style ?? 'normal'};
  font-weight: ${f.weight};
  font-display: swap;
  src: url("/fonts/${f.out}") format("woff2");
}`
  )
  .join('\n\n')}
`;

writeFileSync(OUT_CSS, css);

const total = built.reduce((n, f) => n + f.kb, 0);
console.log(`[fonts] 合计 ${total.toFixed(0)} KB / ${built.length} 个文件，CSS → src/styles/fonts.css`);
