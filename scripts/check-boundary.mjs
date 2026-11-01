/**
 * 边界校验：让"模板/内容"的分界从文档变成机器可执行的规则。
 *
 * 四类检查，任一失败即构建失败：
 *   1. 越界    内容仓库里不许出现需要编译的东西
 *   2. 污染    模板源码里不许出现这个站特有的字符串
 *   3. 契约    theme.json 只能有规定的键与取值
 *   4. 体积    单图 ≤ 2MB，单游戏目录 ≤ 5MB
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

// Windows 上用某些编辑器保存会带 BOM，JSON.parse 会直接抛 SyntaxError
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const SRC = path.join(ROOT, 'src');

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);

const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_GAME = 5 * 1024 * 1024;

const THEME_KEYS = ['accent', 'ink', 'serif', 'width', 'darkDefault', 'radius'];
const THEME_ENUMS = {
  accent: ['marker', 'jade', 'indigo', 'clay', 'moss', 'plum'],
  ink: ['graphite', 'navy'],
  serif: ['noto-serif', 'source-serif'],
  width: ['64', '68', '72'],
  darkDefault: ['auto', 'true', 'false'],
  radius: ['0', '2', '6'],
};

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push({ full, size: st.size });
  }
  return out;
}

/* ---------- 1. 越界：内容仓库里不许有代码 ---------- */
const BANNED_EXT = ['.ts', '.tsx', '.astro', '.mjs', '.cjs', '.vue', '.svelte'];
for (const f of walk(CONTENT)) {
  const name = path.basename(f.full);
  const ext = path.extname(f.full).toLowerCase();
  if (name === 'package.json' || name === 'tsconfig.json' || name === 'astro.config.mjs') {
    fail(`越界：内容仓库里出现 ${rel(f.full)}（需要构建的东西属于模板仓库）`);
  }
  if (BANNED_EXT.includes(ext)) {
    fail(`越界：内容仓库里出现代码文件 ${rel(f.full)}`);
  }
}

/* ---------- 2. 污染：模板里不许硬编码这个站的信息 ---------- */
const sitePath = path.join(CONTENT, 'site.json');
let site = null;
if (existsSync(sitePath)) {
  site = readJson(sitePath);
} else {
  fail('缺少 content/site.json');
}

const forbidden = [];
if (site) {
  if (site.title) forbidden.push(site.title);
  if (site.author?.name) forbidden.push(site.author.name);
  if (site.url) {
    try {
      const host = new URL(site.url).host;
      if (host && !host.endsWith('.invalid')) forbidden.push(host);
      forbidden.push(site.url);
    } catch { /* 域名还没填好，跳过 */ }
  }
}

for (const f of walk(SRC)) {
  if (!['.astro', '.ts', '.js', '.css', '.mjs'].includes(path.extname(f.full).toLowerCase())) continue;
  if (rel(f.full).startsWith('src/data/')) continue; // 构建产物
  const text = readFileSync(f.full, 'utf8');
  for (const word of forbidden) {
    if (word.length >= 2 && text.includes(word)) {
      fail(`污染：${rel(f.full)} 里硬编码了本站信息「${word}」（应来自 site.json）`);
    }
  }
}

/* ---------- 3. 契约：theme.json ---------- */
const themePath = path.join(CONTENT, 'theme.json');
if (!existsSync(themePath)) {
  fail('缺少 content/theme.json');
} else {
  const theme = readJson(themePath);
  for (const key of Object.keys(theme)) {
    if (!THEME_KEYS.includes(key)) fail(`契约：theme.json 出现未定义的键「${key}」`);
  }
  for (const [key, values] of Object.entries(THEME_ENUMS)) {
    if (theme[key] === undefined) {
      warnings.push(`theme.json 缺少 ${key}，将使用默认值`);
      continue;
    }
    if (!values.includes(String(theme[key]))) {
      fail(`契约：theme.json 的 ${key}="${theme[key]}" 不在允许取值内（${values.join(' / ')}）`);
    }
  }
  if (site?.templateVersion && Number(site.templateVersion) > 1) {
    warnings.push(`内容仓库声明的模板版本 ${site.templateVersion} 高于当前模板，请升级模板`);
  }
}

/* ---------- 4. 体积 ---------- */
const uploads = path.join(CONTENT, 'uploads');
for (const f of walk(uploads)) {
  if (f.size > MAX_IMAGE) {
    fail(`体积：${rel(f.full)} 为 ${(f.size / 1048576).toFixed(1)}MB，超过单图 2MB 上限（大文件请用网盘外链）`);
  }
}

const gamesDir = path.join(CONTENT, 'games');
for (const name of existsSync(gamesDir) ? readdirSync(gamesDir) : []) {
  const dir = path.join(gamesDir, name);
  if (!statSync(dir).isDirectory()) continue;
  const total = walk(dir).reduce((n, f) => n + f.size, 0);
  if (total > MAX_GAME) {
    fail(`体积：游戏 ${name} 共 ${(total / 1048576).toFixed(1)}MB，超过 5MB 上限`);
  }
}

/* ---------- 结果 ---------- */
for (const w of warnings) console.warn('[check-boundary] 警告：' + w);

if (errors.length) {
  console.error('\n[check-boundary] 边界校验失败：');
  for (const e of errors) console.error('  ✗ ' + e);
  console.error(`\n共 ${errors.length} 条。修复后重跑。\n`);
  process.exit(1);
}

console.log('[check-boundary] 通过（越界 0 / 污染 0 / 契约 OK / 体积 OK）');
