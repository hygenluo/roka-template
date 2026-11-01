# Decap CMS 的 OAuth 中转

`/admin` 是个纯静态页面，没法安全地保存 GitHub OAuth 的 client secret，所以需要这 40 来行代码做一次密钥交换。**一次性部署，之后不用管。**

## 部署步骤

1. 建一个 GitHub OAuth App（Settings → Developer settings → OAuth Apps）：
   - Homepage URL：你的站点地址
   - Authorization callback URL：`https://<你的-worker域名>/callback`
2. 装好 wrangler 后，在本目录执行：

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler deploy
```

3. 把 `wrangler.toml` 里的 `SITE_URL`、`ALLOWED_LOGIN` 改成你的值后再 deploy 一次。
4. 构建站点时把 worker 地址传给模板：

```bash
OAUTH_BASE_URL=https://decap-oauth.<你的账号>.workers.dev
CONTENT_REPO_SLUG=<你的账号>/site-content
```

## 安全说明

- `ALLOWED_LOGIN` 不填就等于放行任何 GitHub 账号，**单作者站点务必填**。
- `state` 通过 HttpOnly Cookie 校验，防 CSRF。
- token 只在 postMessage 里交给 `/admin` 的同源窗口，不落任何存储。
- 嫌麻烦也可以用 [Decap Turbo](https://decapcms.org/turbo/) 的托管认证，代价是多一个外部依赖。
