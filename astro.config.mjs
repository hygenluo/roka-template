import { defineConfig } from 'astro/config';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// 站点地址来自内容仓库的 site.json，模板里不留任何本站信息
let site = 'https://site.invalid';
const siteFile = path.join(import.meta.dirname, 'content', 'site.json');
if (existsSync(siteFile)) {
  try {
    site = JSON.parse(readFileSync(siteFile, 'utf8')).url || site;
  } catch {
    /* 内容还没就位，用占位域名，构建前置脚本会报错 */
  }
}

export default defineConfig({
  site,
  build: {
    inlineStylesheets: 'auto',
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
