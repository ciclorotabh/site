import type { APIRoute } from 'astro';
import { carregarContagens } from '../../lib/dados';

// Dados abertos: todas as contagens, uma por linha, já com as janelas derivadas da contagem hora a hora.
const esc = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async () => {
  const { dados } = await carregarContagens();
  const locais = Object.fromEntries(dados.locais.map((l) => [l.id, l]));
  const linhas = [['data', 'periodo_horas', 'ciclistas', 'local', 'latitude', 'longitude', 'tipo', 'fonte', 'derivada_hora_a_hora'].join(',')];
  for (const c of dados.contagens) {
    const l = locais[c.local];
    linhas.push([c.data, c.periodo, c.ciclistas, l.nome, l.lat, l.lon, c.tipo, c.fonte.join('; '), c.derivada ? 'sim' : 'não'].map(esc).join(','));
  }
  return new Response('﻿' + linhas.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
