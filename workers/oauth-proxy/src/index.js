/**
 * GitHub OAuth 中转，给 Decap CMS 用。
 *
 * Decap 是纯静态页面，没法自己完成 OAuth 的密钥交换，
 * 所以需要一个极小的服务端：/auth 跳去 GitHub，/callback 换 token
 * 再把 token 通过 postMessage 还给 /admin 的窗口。
 *
 * 部署：wrangler deploy
 * 环境变量（Secret）：
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 * 环境变量（普通变量）：
 *   SITE_URL   例如 https://roka.<你的子域>.workers.dev
 *   ALLOWED_LOGIN  只放行这个 GitHub 用户名
 */

const GITHUB = 'https://github.com/login/oauth';

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const siteUrl = (env.SITE_URL || url.origin).replace(/\/$/, '');

    if (url.pathname === '/auth') {
      const state = crypto.randomUUID();
      const redirect = `${url.origin}/callback`;
      const authorize = new URL(`${GITHUB}/authorize`);
      authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      authorize.searchParams.set('redirect_uri', redirect);
      authorize.searchParams.set('scope', 'repo');
      authorize.searchParams.set('state', state);

      // 注意：不能用 Response.redirect() —— 它的 headers 是不可变的，
      // 后面 append Set-Cookie 会直接抛 TypeError（线上表现为 500）。
      return new Response(null, {
        status: 302,
        headers: {
          Location: authorize.href,
          // state 存 Cookie，回跳时比对，防 CSRF
          'Set-Cookie': `decap_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
        },
      });
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const cookie = request.headers.get('Cookie') || '';
      const expected = /decap_state=([^;]+)/.exec(cookie)?.[1];

      if (!code) return html('缺少 code 参数', 400);
      if (!expected || state !== expected) return html('state 不匹配，登录被拒绝', 403);

      const tokenRes = await fetch(`${GITHUB}/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${url.origin}/callback`,
        }),
      });

      const data = await tokenRes.json();
      if (!data.access_token) return html('换取 token 失败，请重试', 400);

      // 只放行指定账号 —— 单作者站点，别留任何后门
      if (env.ALLOWED_LOGIN) {
        const me = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            'User-Agent': 'decap-oauth-proxy',
          },
        }).then((r) => r.json());
        if (me.login !== env.ALLOWED_LOGIN) {
          return html(`账号 ${me.login} 不在白名单内`, 403);
        }
      }

      const payload = JSON.stringify({ token: data.access_token, provider: 'github' });
      const safe = payload.replace(/</g, '\\u003c');

      return html(`<!doctype html><html><head><meta charset="utf-8"><title>授权中</title></head><body>
<script>
(function () {
  function receive(e) {
    window.opener.postMessage('authorization:github:success:${safe}', e.origin);
    window.removeEventListener('message', receive, false);
  }
  window.addEventListener('message', receive, false);
  window.opener.postMessage('authorizing:github', '${siteUrl}');
})();
</script>
</body></html>`);
    }

    return html('oauth proxy ok', 200);
  },
};
