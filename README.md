# roka-template

个人站点的**引擎**。内容和它分开住在另一个仓库里（`roka-content`）。

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
├── roka-template/   ← 这个仓库
└── roka-content/    ← 内容仓库
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

## 部署（Cloudflare Workers，新版流程）

静态资源不再走 Pages，走 **Workers Static Assets**。配置在 `wrangler.jsonc`：

| 字段 | 值 | 作用 |
|---|---|---|
| `assets.directory` | `./dist/` | 构建产物目录 |
| `not_found_handling` | `404-page` | 未命中时返回 `dist/404.html` |
| `html_handling` | `auto-trailing-slash` | 与 canonical（`/blog/` 带斜杠）一致 |

**没有 Worker 脚本**：纯静态站，请求直接命中资源。静态资源请求免费且不限量，只有命中 Worker 脚本的请求才计费。

### 首次部署

1. Cloudflare → **Workers & Pages → Create → Continue with GitHub → 选 `roka-template`**
2. 构建设置：**Build command** `pnpm build`，**Deploy command** `npx wrangler deploy`（默认值，确认即可）
3. **Build Variables and Secrets** 填上那 4 个内容仓库相关变量（+ 私有仓库的 token，见下）
4. Deploy

构建镜像默认 Node **24.22.1** / pnpm **9.10**，与 lockfile 同大版本，不用额外指定版本。

### ⚠️ 内容仓库是私有的，部署必须多一项

`CONTENT_REPO_URL` 指向私有仓库时，匿名 clone 会失败（构建日志里是 `could not read Username`）。
需要在 GitHub 建一个 **fine-grained PAT**：

- Repository access：只选 `roka-content`
- Permissions：**Contents = Read-only**（其余全留 No access）
- 有效期按需，到期前记得换

然后把这个 token 作为构建变量 **`CONTENT_REPO_TOKEN`**（Secret，不要写进仓库）。
`pull-content.mjs` 会把它拼进 clone URL，用完即弃。

### 内容更新后自动重建

Workers Builds 同样支持 Deploy Hooks：
**Settings → Builds → Deploy Hooks → 建一个指向 `main` 的 hook**，把 URL 存进内容仓库的 secret `DEPLOY_HOOK_URL`。
`notify.yml` 会在每次 push 后 `curl -X POST` 它（同一 hook 短时间内重复触发不会产生重复构建）。

### 手动部署（可选）

```bash
pnpm build
pnpm deploy          # wrangler deploy
pnpm preview:worker  # wrangler 本地起服务，路由行为与线上一致
```

**为何不用 git submodule**：构建镜像不会自动 `git submodule update --init`，
且 submodule 的内容更新不会触发父仓库构建——"推了但没生效"是最难查的 bug。

## 站内编辑

`/admin` 是 Decap CMS，`backend.repo` 指向**内容仓库**，所以编辑只产生内容仓库的 commit，
模板仓库的提交历史永远干净。部署 OAuth 中转见 `workers/oauth-proxy/README.md`。

编辑器的运行时是**自托管**的：`admin/vendor/decap-cms.js`（4.7MB，官方产物）随仓库提交，
构建时复制到 `public/admin/vendor/`。这样不依赖 unpkg 之类的 CDN——国内也能打开。
文件大但不影响访客，只有你自己打开 `/admin` 时才下载。

> 为什么不用 npm 装：`decap-cms-app@3.17.3` 的依赖里引用了不存在的 `decap-cms-core@3.20.2`，
> 装不上。直接锁定官方产物更稳。

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

## 字体：按实际用字子集化

中文不加载整包字体。`scripts/build-fonts.mjs` 会扫描 `content/` 和 `src/` 里出现的所有字符，
用 `pyftsubset` 生成只含这些字形的 woff2：

| | 之前（fontsource 切片） | 现在（子集化） |
|---|---|---|
| 中文字体文件 | 404 个 / 24 MB | **4 个 / 486 KB** |
| 整站产物 | 822 文件 / 25.3 MB | **91 文件 / 1.7 MB** |
| CSS | 490 KB | 22 KB |

产物（`public/fonts/*.woff2` + `src/styles/fonts-cjk.css` + `src/fonts/subset-chars.txt`）**提交进仓库**，
构建时不做子集化——Cloudflare 构建镜像里没有 fonttools，也不该每次下载 40MB 源字体。

**内容里出现新字之后要手动跑一次：**

```bash
pnpm fonts:build
```

不跑也不会炸：`check-fonts.mjs` 会在构建日志里列出哪些字没覆盖（它们会回退到系统字体，看着会不太对）。
源字体缓存在 `.fonts-cache/`（已 gitignore）。

## 已知取舍

- 字体子集是**内容驱动**的，所以改完内容要记得 `pnpm fonts:build`，见上一节。
- 每次构建多一次内容仓库浅克隆。
- 小游戏包上限 5MB，图片上限 2MB，超了构建直接失败——大文件放网盘外链。
