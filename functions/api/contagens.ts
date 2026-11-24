import { lerPlanilha, type Dados } from '../_lib/contagens';
import { membroDaOrg } from '../_lib/http';
import type { Contexto, CacheBorda } from '../_lib/tipos';
import { SITE } from '../../src/lib/site';

const TTL_OK = 300; // 5 minutos com a planilha respondendo
const TTL_RESERVA = 60; // 1 minuto quando a planilha falhou (para não martelar o Google)

type Resposta = { fonte: 'planilha' | 'reserva'; lidoEm: string; erro: string | null; dados: Dados };

// GET /api/contagens  -> contagens lidas ao vivo da planilha do Google, com cache na borda.
// GET /api/contagens?fresco=1 com o token do painel -> ignora o cache (página "Conferir planilha").
export async function onRequestGet({ request, env, waitUntil }: Contexto): Promise<Response> {
  const url = new URL(request.url);
  const chave = new Request(new URL('/api/contagens', url).toString());
  const cache = (globalThis as unknown as { caches?: { default?: CacheBorda } }).caches?.default;

  let fresco = false;
  if (url.searchParams.get('fresco') === '1') {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    fresco = await membroDaOrg(token, env.GITHUB_ORG);
  }
  if (!fresco && cache) {
    const salvo = await cache.match(chave).catch(() => undefined);
    if (salvo) return salvo;
  }

  let corpo: Resposta;
  try {
    corpo = { fonte: 'planilha', lidoEm: new Date().toISOString(), erro: null, dados: await lerPlanilha(SITE.planilha) };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    const r = await env.ASSETS.fetch(new URL('/api-dados/contagens.json', url).toString());
    if (!r.ok) return new Response(JSON.stringify({ erro }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    corpo = { fonte: 'reserva', lidoEm: new Date().toISOString(), erro, dados: (await r.json()) as Dados };
  }
  const ttl = corpo.fonte === 'planilha' ? TTL_OK : TTL_RESERVA;
  const resposta = new Response(JSON.stringify(corpo), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` },
  });
  if (cache) {
    const gravar = cache.put(chave, resposta.clone()).catch(() => undefined);
    if (waitUntil) waitUntil(gravar); else await gravar;
  }
  return resposta;
}
