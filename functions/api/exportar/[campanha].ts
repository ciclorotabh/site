import { membroDaOrg } from '../../_lib/http';
import type { Contexto } from '../../_lib/tipos';

// GET /api/exportar/<campanha>  com  Authorization: Bearer <token do GitHub do painel>
// Só membros da organização baixam. A lista sai com nome, bairro e data: o e-mail não é entregue.
export async function onRequestGet({ request, env, params }: Contexto<'campanha'>): Promise<Response> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!(await membroDaOrg(token, env.GITHUB_ORG))) return new Response('Acesso negado.', { status: 403 });
  if (!/^[a-z0-9-]{1,80}$/.test(params.campanha)) return new Response('Campanha inválida.', { status: 400 });
  const r = await env.DB.prepare('SELECT nome, bairro, criado_em FROM assinaturas WHERE campanha = ?1 ORDER BY criado_em')
    .bind(params.campanha)
    .all<{ nome: string; bairro: string | null; criado_em: string }>();
  const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const linhas = ['numero,nome,bairro,data'];
  r.results.forEach((a, i) => {
    const d = a.criado_em.slice(0, 10).split('-').reverse().join('/');
    linhas.push([String(i + 1), esc(a.nome), esc(a.bairro ?? ''), d].join(','));
  });
  return new Response('﻿' + linhas.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="assinaturas-${params.campanha}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
