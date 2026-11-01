/**
 * 小游戏同步：content/games/<slug>/**  →  public/game-assets/<slug>/**
 *
 * 游戏包随内容仓库走（零构建静态包），这里只做搬运。
 * 刻意放在 /game-assets/ 而不是 /games/：后者是外壳页的路由，
 * 同名会撞车（Astro 会跳过同路径的路由）。
 */
import { existsSync } from 'node:fs';
import { rm, cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'content', 'games');
const DEST = path.join(ROOT, 'public', 'game-assets');

if (!existsSync(SRC)) {
  console.log('[sync-games] 没有 games 目录，跳过');
  process.exit(0);
}

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });

let count = 0;
for (const entry of await readdir(SRC)) {
  const full = path.join(SRC, entry);
  if (!(await stat(full)).isDirectory()) continue;
  await cp(full, path.join(DEST, entry), { recursive: true });
  count++;
}

console.log(`[sync-games] 同步了 ${count} 个小游戏到 public/game-assets/`);
