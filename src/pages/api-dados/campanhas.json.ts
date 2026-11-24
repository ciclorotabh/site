import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Lista das campanhas abertas, lida pela função /api/assinar para recusar assinatura em campanha fechada.
export const GET: APIRoute = async () => {
  const abertas = await getCollection('campanhas', ({ data }) => data.status === 'aberta');
  const lista = abertas.map((c) => ({ id: c.id, title: c.data.title, closesAt: c.data.closesAt?.toISOString() ?? null }));
  return new Response(JSON.stringify(lista), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
