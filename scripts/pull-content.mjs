/**
 * 把内容仓库"搬"到模板仓库的 content/ 下。
 *
 * 三条路径，跑的是同一份结果：
 *   1. 本地并排放着 ../roka-content  → 复制过来（日常开发）
 *   2. 配置了 CONTENT_REPO_URL        → 浅克隆（CI / Cloudflare Pages）
 *   3. 上一轮已经搬过               → 直接复用
 *
 * 刻意不用 git submodule：CI 不会自动初始化，且 detached HEAD 让
 * "内容提交了但站点没变" 变成一件很容易发生的事。
 */
import { existsSync } from 'node:fs';
import { cp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGET = path.join(ROOT, 'content');

const LOCAL = process.env.CONTENT_LOCAL
  ? path.resolve(ROOT, process.env.CONTENT_LOCAL)
  : path.resolve(ROOT, '..', 'roka-content');

const REPO = process.env.CONTENT_REPO_URL;
const BRANCH = process.env.CONTENT_BRANCH || 'main';
const TOKEN = process.env.CONTENT_REPO_TOKEN;

const skip = (src) => {
  const base = path.basename(src);
  return base === '.git' || base === 'node_modules';
};

const log = (...args) => console.log('[pull-content]', ...args);

async function fromLocalDir() {
  log('本地内容仓库 →', LOCAL);
  await rm(TARGET, { recursive: true, force: true });
  await cp(LOCAL, TARGET, { recursive: true, filter: (src) => !skip(src) });
  log('已同步');
}

function cloneUrl() {
  if (!TOKEN) return REPO;
  // https://github.com/o/r  →  https://x-access-token:TOKEN@github.com/o/r
  return REPO.replace(/^https:\/\//, `https://x-access-token:${TOKEN}@`);
}

async function fromGit() {
  log('克隆内容仓库 →', REPO, `#${BRANCH}`);
  await rm(TARGET, { recursive: true, force: true });
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--single-branch', '--branch', BRANCH, cloneUrl(), TARGET],
    { stdio: 'inherit' }
  );
  await rm(path.join(TARGET, '.git'), { recursive: true, force: true });
  log('已克隆');
}

if (existsSync(path.join(LOCAL, 'site.json'))) {
  await fromLocalDir();
} else if (REPO) {
  await fromGit();
} else if (existsSync(path.join(TARGET, 'site.json'))) {
  log('复用已存在的 content/');
} else {
  await mkdir(TARGET, { recursive: true });
  console.error(
    [
      '[pull-content] 找不到内容仓库。三选一：',
      '  1) 把内容仓库克隆到与本仓库并列的 ../roka-content',
      '  2) 设置环境变量 CONTENT_REPO_URL=https://github.com/HygenLuo/roka-content',
      '  3) 设置 CONTENT_LOCAL 指向内容仓库的绝对路径',
    ].join('\n')
  );
  process.exit(1);
}
