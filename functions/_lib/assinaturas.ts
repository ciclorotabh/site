import type { D1Database } from './tipos';

export const VERSAO_TERMO = '2026-11-24';
export const LIMITE_POR_IP_HORA = 5;
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type Entrada = {
  campanha: string;
  nome: string;
  email: string;
  bairro: string | null;
  consentimento: boolean;
  aceitaOutros: boolean;
  token: string;
};

export type Resultado =
  | { ok: true; status: 'assinada' | 'repetida' }
  | { ok: false; codigo: number; erro: string };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;

/** Valida e normaliza o formulário. Devolve a mensagem de erro para quem assina. */
export function validar(dados: Record<string, unknown>): { entrada?: Entrada; erro?: string } {
  const txt = (k: string, max: number) => String(dados[k] ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const campanha = txt('campanha', 80);
  const nome = txt('nome', 120);
  const email = txt('email', 254).toLowerCase();
  const bairro = txt('bairro', 80) || null;
  const marcado = (k: string) => ['on', 'true', '1', 'sim'].includes(String(dados[k] ?? '').toLowerCase());
  if (!SLUG.test(campanha)) return { erro: 'Campanha inválida.' };
  if (nome.length < 3 || !/\p{L}/u.test(nome)) return { erro: 'Escreva seu nome completo.' };
  if (!EMAIL.test(email)) return { erro: 'Confira o e-mail.' };
  if (!marcado('consentimento')) return { erro: 'Para assinar, marque a caixa de concordância.' };
  return {
    entrada: {
      campanha, nome, email, bairro,
      consentimento: true,
      aceitaOutros: marcado('outros'),
      token: txt('cf-turnstile-response', 4096),
    },
  };
}

/** SHA-256 de sal + IP, em hexadecimal. O IP puro nunca é gravado. */
export async function hashIp(ip: string, sal: string): Promise<string> {
  const dados = new TextEncoder().encode(`${sal}:${ip}`);
  const dig = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Confere o Turnstile com tempo limite. Se o serviço não responder, recusa (falha fechada). */
export async function verificarTurnstile(
  token: string,
  segredo: string | undefined,
  ip: string,
  buscar: typeof fetch = fetch,
): Promise<'ok' | 'invalido' | 'indisponivel'> {
  if (!segredo) return 'ok'; // ambiente de desenvolvimento
  if (!token) return 'invalido';
  const corpo = new FormData();
  corpo.append('secret', segredo);
  corpo.append('response', token);
  corpo.append('remoteip', ip);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await buscar(TURNSTILE_URL, { method: 'POST', body: corpo, signal: AbortSignal.timeout(4000) });
      if (r.status >= 500) throw new Error(`turnstile ${r.status}`);
      const j = (await r.json()) as { success?: boolean };
      return j.success ? 'ok' : 'invalido';
    } catch {
      if (tentativa === 0) await new Promise((res) => setTimeout(res, 300));
    }
  }
  return 'indisponivel';
}

/** Grava a assinatura. A unicidade (campanha, e-mail) é garantida pelo banco, não por leitura prévia. */
export async function gravar(db: D1Database, e: Entrada, ipHash: string, agora = new Date()): Promise<Resultado> {
  const umaHoraAtras = new Date(agora.getTime() - 3600_000).toISOString();
  const recentes = await db
    .prepare('SELECT COUNT(*) AS n FROM assinaturas WHERE ip_hash = ?1 AND criado_em > ?2')
    .bind(ipHash, umaHoraAtras)
    .first<{ n: number }>();
  if ((recentes?.n ?? 0) >= LIMITE_POR_IP_HORA) {
    return { ok: false, codigo: 429, erro: 'Muitas assinaturas desta conexão na última hora. Tente mais tarde.' };
  }
  const r = await db
    .prepare(
      `INSERT INTO assinaturas (campanha, nome, email, bairro, aceita_outros, versao_termo, ip_hash, criado_em)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (campanha, email) DO NOTHING`,
    )
    .bind(e.campanha, e.nome, e.email, e.bairro, e.aceitaOutros ? 1 : 0, VERSAO_TERMO, ipHash, agora.toISOString())
    .run();
  return { ok: true, status: r.meta.changes === 1 ? 'assinada' : 'repetida' };
}

export async function contar(db: D1Database, campanha: string): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM assinaturas WHERE campanha = ?1').bind(campanha).first<{ n: number }>();
  return r?.n ?? 0;
}
