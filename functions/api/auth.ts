import type { Contexto } from '../_lib/tipos';

// GET /api/auth  -> manda para o GitHub. Chamado pelo painel (Decap CMS) numa janela pop-up.
// O repositório é público, então basta public_repo; read:org permite conferir quem exporta assinaturas.
export async function onRequestGet({ request, env }: Contexto): Promise<Response> {
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const github = new URL('https://github.com/login/oauth/authorize');
  github.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  github.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  github.searchParams.set('scope', 'public_repo read:org');
  github.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: github.toString(),
      'Set-Cookie': `oauth_state=${state}; Path=/api/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  });
}
