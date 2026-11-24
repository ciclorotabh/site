import type { Env } from './tipos';

export const json = (dados: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

export type CampanhaAberta = { id: string; title: string; closesAt: string | null };

/** Campanhas abertas, publicadas pelo próprio build em /api-dados/campanhas.json. */
export async function campanhasAbertas(env: Env, base: string): Promise<CampanhaAberta[]> {
  const r = await env.ASSETS.fetch(new URL('/api-dados/campanhas.json', base).toString());
  if (!r.ok) return [];
  const lista = (await r.json()) as CampanhaAberta[];
  const agora = Date.now();
  return lista.filter((c) => !c.closesAt || Date.parse(c.closesAt) > agora);
}

/** Confere se o token do GitHub é de um membro ativo da organização dona do site. */
export async function membroDaOrg(token: string, org: string): Promise<boolean> {
  if (!token) return false;
  try {
    const r = await fetch(`https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ciclorotabh-site', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return false;
    const m = (await r.json()) as { state?: string };
    return m.state === 'active';
  } catch {
    return false;
  }
}
