import type { APIRoute } from 'astro';
import { carregarContagens } from '../../lib/dados';

// Retrato das contagens no momento do build. A função /api/contagens usa como reserva se a planilha falhar.
export const GET: APIRoute = async () => {
  const { dados } = await carregarContagens();
  return new Response(JSON.stringify(dados), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
