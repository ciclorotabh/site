import type { Contexto } from '../_lib/tipos';

const pagina = (mensagem: string, origem: string) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Entrando…</title>
<body style="font-family:system-ui;padding:24px">Entrando no painel…<script>
(function () {
  var origem = ${JSON.stringify(origem)};
  var msg = ${JSON.stringify(mensagem)};
  function recebe(e) {
    if (e.origin !== origem) return;
    window.opener.postMessage(msg, origem);
    window.removeEventListener('message', recebe);
  }
  window.addEventListener('message', recebe);
  window.opener && window.opener.postMessage('authorizing:github', origem);
})();
</script></body></html>`;

// GET /api/callback?code=…&state=…  -> troca o código pelo token e devolve ao painel (protocolo do Decap CMS).
export async function onRequestGet({ request, env }: Contexto): Promise<Response> {
  const url = new URL(request.url);
  const origem = url.origin;
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const cookie = /(?:^|;\s*)oauth_state=([^;]+)/.exec(request.headers.get('Cookie') ?? '')?.[1];
  const html = (m: string, status = 200) =>
    new Response(pagina(m, origem), {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': 'oauth_state=; Path=/api/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
      },
    });
  if (!code || !state || state !== cookie) {
    return html('authorization:github:error:' + JSON.stringify({ message: 'Login expirado. Tente de novo.' }), 400);
  }
  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'ciclorotabh-site' },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${origem}/api/callback` }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { access_token?: string; error_description?: string };
    if (!j.access_token) throw new Error(j.error_description ?? 'sem token');
    return html('authorization:github:success:' + JSON.stringify({ token: j.access_token, provider: 'github' }));
  } catch (e) {
    return html('authorization:github:error:' + JSON.stringify({ message: 'O GitHub não respondeu. Tente de novo.' }), 502);
  }
}
