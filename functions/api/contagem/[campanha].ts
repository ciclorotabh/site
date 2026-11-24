import { contar } from '../../_lib/assinaturas';
import { json } from '../../_lib/http';
import type { Contexto } from '../../_lib/tipos';

// GET /api/contagem/<campanha>  -> { total }
export async function onRequestGet({ env, params }: Contexto<'campanha'>): Promise<Response> {
  if (!/^[a-z0-9-]{1,80}$/.test(params.campanha)) return json({ erro: 'Campanha inválida.' }, 400);
  const total = await contar(env.DB, params.campanha);
  return json({ total }, 200, { 'Cache-Control': 'public, max-age=30' });
}
