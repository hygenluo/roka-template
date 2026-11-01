# site-template

个人站点的**引擎**。内容和它分开住在另一个仓库里（`site-content`）。

```
├── src/
│   ├── content.config.ts   ← 数据契约（Zod schema）
│   ├── components/ layouts/ pages/ styles/
│   └── lib/                ← site.json / theme.json 的读取与翻译
├── scripts/
│   ├── prepare.mjs         ← 构建前置：五步串起来
│   ├── pull-content.mjs    ← 把内容仓库搬进 content/
│   ├── check-boundary.mjs  ← 分界规则，违规就中止构建
│   ├── sync-media.mjs      ← 图片进 public/ 并生成 webp 变体
│   ├── sync-games.mjs      ← 小游戏包进 public/game-assets/
│   └── sync-admin-config.mjs ← 生成 /admin 的 config.yml
├── admin/                  ← Decap CMS 的界面定义（模板侧）
├── workers/oauth-proxy/    ← GitHub OAuth 中转
└── content/                ← gitignore，构建时由脚本填充
```

## 分界原则

> **删掉这个站的个人信息之后，模板还能被别人克隆起来建一个新站吗？**
> 删得掉的 → 内容仓库；删不掉的（引擎、契约、部署配置）→ 模板仓库。

三条判据，冲突时上位胜出：

1. **可复用性** —— 站名、作者、域名、文章、项目都不许出现在模板里。
2. **变更频率** —— 每天改的东西归内容，改代码才动的东西归模板。
3. **是否需要构建** —— 需要 npm/编译的归模板；浏览器能直接跑的归内容。

`scripts/check-boundary.mjs` 把这三条变成了机器规则（越界 / 污染 / 契约 / 体积），
**写在文档里会被忘记，写在构建里不会**。

## 本地开发

两个仓库并排放：

```
workspace/
├── site-template/   ← 这个仓库
└── site-content/    ← 内容仓库
```

```bash
pnpm install
pnpm dev      # 自动同步内容 → astro dev
pnpm build    # 前置同步 + 静态构建
pnpm verify   # 同上，CI 和部署用这个
```

内容仓库不在并排位置时，用环境变量指过去：

| 变量 | 作用 |
|---|---|
| `CONTENT_LOCAL` | 内容仓库的本地绝对路径 |
| `CONTENT_REPO_URL` | 内容仓库地址，CI 里浅克隆它 |
| `CONTENT_REPO_TOKEN` | 私有内容仓库的只读 PAT |
| `CONTENT_REPO_SLUG` | `owner/repo`，写进 `/admin` 的 config.yml |
| `CONTENT_BRANCH` | 默认 `main` |
| `OAUTH_BASE_URL` | OAuth 中转的地址，`/admin` 登录用 |

## 部署（Cloudflare Pages）

1. Pages 连接**这个仓库**，构建命令 `pnpm build`，输出目录 `dist`。
2. 环境变量填上表里那几项。
3. 在 Pages 设置里建一个 **Deploy Hook**，把 URL 存进内容仓库的 secret `DEPLOY_HOOK_URL`。
   之后内容仓库一 push，`notify.yml` 就会叫 Pages 重建。

**为何不用 git submodule**：Pages 的构建环境不会自动 `git submodule update --init`，
且 submodule 的内容更新不会让父仓库的构建自动触发——"推了但没生效"是最难查的 bug。

## 站内编辑

`/admin` 是 Decap CMS，`backend.repo` 指向**内容仓库**，所以编辑只产生内容仓库的 commit，
模板仓库的提交历史永远干净。部署 OAuth 中转见 `workers/oauth-proxy/README.md`。

**能力边界**（配置时就该知道）：保存到上线 1–2 分钟；批量传图是逐张 commit；
双仓库后没有编辑分支预览，草稿用 `draft: true` 不渲染。

## 数据契约（改之前先读）

`src/content.config.ts` 里的 Zod schema 是模板与内容之间唯一的结构约定：

- **新增字段必须是 optional** —— 否则所有历史文章立刻构建失败。
- **删除或重命名字段是破坏性变更** —— 必须配 `scripts/migrate-content.mjs` 并升 `templateVersion`。

## 页面

| 路由 | 说明 |
|---|---|
| `/` | 首屏 + 最新教程 + 最近随笔 + 精选项目 |
| `/blog` `/blog/[id]` | 教程；按系列分组，系列内带上一篇/下一篇 |
| `/notes` `/notes/[id]` | 随笔；按年月分组，窄栏 + 无衬线正文 |
| `/projects` `/projects/[id]` | 项目三分区；网盘卡片带提取码与"最后校验"日期 |
| `/games` `/games/[id]` | 小游戏外壳（全出血、无索引栏），iframe 沙箱 |
| `/tags` `/tags/[tag]` | 横向索引 |
| `/search` | Pagefind 静态搜索，索引在 `pnpm build` 最后一步生成 |
| `/rss.xml` `/admin` | 订阅、站内编辑 |

`pnpm build` = 前置同步 → `astro build` → `pagefind --site dist`，三步缺一不可。

## 视觉系统

设计 token 在 `src/styles/global.css`，档位由内容仓库的 `theme.json` 选择（6 个键，多一个键构建失败）。
版心宽度、强调色、墨色、衬线、圆角、默认明暗——**只能选档位，不能写样式**。
一旦允许内容侧写 CSS，模板升级和内容变更就永久互相污染。

## 已知取舍

- 中文字体走 fontsource 的 unicode-range 切片，产物里约 800 个字体文件 / 25MB（`.woff` 是给老浏览器的，
  现代浏览器不会下载）。要瘦身可以在构建期用 `pyftsubset` 按实际用字子集化。
- 每次构建多一次内容仓库浅克隆。
- 小游戏包上限 5MB，图片上限 2MB，超了构建直接失败——大文件放网盘外链。
