/**
 * 构建前置步骤，顺序不能乱：
 *   1. pull-content        两个仓库拼起来
 *   2. check-boundary      分界规则先过一遍（越界就别浪费构建时间）
 *   3. check-fonts         提示字体子集有没有漏字
 *   4. sync-media          图片进 public/ 并生成变体清单
 *   5. sync-games          小游戏包进 public/
 *   6. sync-admin-config   生成 /admin 的配置
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const steps = [
  'pull-content.mjs',
  'check-boundary.mjs',
  'check-fonts.mjs',
  'sync-media.mjs',
  'sync-games.mjs',
  'sync-admin-config.mjs',
];

for (const step of steps) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', step)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    console.error(`[prepare] ${step} 失败，构建中止`);
    process.exit(res.status ?? 1);
  }
}

console.log('[prepare] 完成');
