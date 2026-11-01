/**
 * 媒体同步：
 *   content/uploads/**  →  public/uploads/**（原图，供 Decap 写入的绝对路径直接命中）
 *   同时用 sharp 生成 webp 变体，并写 src/data/media.json 供 <Img> 组件读取。
 *
 * 构建期做一次，运行时零成本；图片没变就跳过重算。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'content', 'uploads');
const DEST = path.join(ROOT, 'public', 'uploads');
const MANIFEST = path.join(ROOT, 'src', 'data', 'media.json');

const WIDTHS = [480, 960, 1440];
const RASTER = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

async function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const relPosix = (p) => path.relative(SRC, p).split(path.sep).join('/');

await mkdir(DEST, { recursive: true });
await mkdir(path.dirname(MANIFEST), { recursive: true });

const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const manifest = {};

for (const file of await walk(SRC)) {
  const rel = relPosix(file);
  const outPath = path.join(DEST, rel);
  await mkdir(path.dirname(outPath), { recursive: true });
  await copyFile(file, outPath);

  const ext = path.extname(file).toLowerCase();
  const url = '/uploads/' + rel;

  if (!RASTER.has(ext)) {
    manifest[url] = { w: null, h: null, variants: [] };
    continue;
  }

  const st = await stat(file);
  const cache = previous[url];
  if (cache && cache.mtimeMs === st.mtimeMs && cache.variants.every(v => existsSync(path.join(DEST, v.src.replace('/uploads/', ''))))) {
    manifest[url] = cache;
    continue;
  }

  const img = sharp(file);
  const meta = await img.metadata();
  const variants = [];
  for (const w of WIDTHS) {
    if (meta.width && w >= meta.width) continue;
    const name = `${path.basename(rel, ext)}-${w}.webp`;
    const vPath = path.join(path.dirname(outPath), name);
    await sharp(file).resize({ width: w }).webp({ quality: 82 }).toFile(vPath);
    variants.push({ w, src: '/uploads/' + path.posix.join(path.posix.dirname(rel), name) });
  }

  manifest[url] = {
    w: meta.width ?? null,
    h: meta.height ?? null,
    mtimeMs: st.mtimeMs,
    variants,
  };
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[sync-media] ${Object.keys(manifest).length} 个媒体文件，清单已写入 src/data/media.json`);
