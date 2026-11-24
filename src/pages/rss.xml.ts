import type { APIRoute } from 'astro';
import { artigos, noticias } from '../lib/conteudo';
import { SITE } from '../lib/site';

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL(SITE.url);
  const itens = [
    ...(await artigos()).map((a) => ({ t: a.data.title, d: a.data.description, data: a.data.date, url: new URL(`/artigo/${a.id}/`, base).href })),
    ...(await noticias()).map((n) => ({ t: n.data.title, d: n.data.description, data: n.data.date, url: new URL(`/noticias/${n.id}/`, base).href })),
  ].sort((a, b) => b.data.valueOf() - a.data.valueOf()).slice(0, 30);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${x(SITE.name)}</title><link>${base.href}</link><description>${x(SITE.description)}</description><language>pt-BR</language>
${itens.map((i) => `<item><title>${x(i.t)}</title><link>${i.url}</link><guid>${i.url}</guid><pubDate>${i.data.toUTCString()}</pubDate><description>${x(i.d)}</description></item>`).join('\n')}
</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
