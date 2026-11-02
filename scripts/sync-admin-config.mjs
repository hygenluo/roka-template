/**
 * 把 admin/config.yml 的模板占位符替换成真实值，输出到 public/admin/。
 *
 * 这样模板仓库里不出现任何本站信息（域名、内容仓库地址），
 * 它们全部来自构建时环境变量。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'admin');
const DEST = path.join(ROOT, 'public', 'admin');

const site = JSON.parse(
  readFileSync(path.join(ROOT, 'content', 'site.json'), 'utf8').replace(/^\uFEFF/, '')
);

const values = {
  __CONTENT_REPO__: process.env.CONTENT_REPO_SLUG || 'you/roka-content',
  __CONTENT_BRANCH__: process.env.CONTENT_BRANCH || 'main',
  __AUTH_BASE_URL__: process.env.OAUTH_BASE_URL || 'https://auth.site.invalid',
  __SITE_URL__: site.url,
  __SITE_TITLE__: site.title,
};

if (!process.env.CONTENT_REPO_SLUG) {
  console.warn('[sync-admin] 未设置 CONTENT_REPO_SLUG，/admin 将写入占位仓库 you/roka-content');
}

mkdirSync(DEST, { recursive: true });

let config = readFileSync(path.join(SRC, 'config.yml'), 'utf8');
for (const [k, v] of Object.entries(values)) config = config.split(k).join(String(v));
writeFileSync(path.join(DEST, 'config.yml'), config);

if (existsSync(path.join(SRC, 'index.html'))) {
  copyFileSync(path.join(SRC, 'index.html'), path.join(DEST, 'index.html'));
}

console.log('[sync-admin] /admin 配置已生成');
