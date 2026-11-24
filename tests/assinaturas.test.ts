import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { validar, gravar, contar, hashIp, verificarTurnstile, LIMITE_POR_IP_HORA, type Entrada } from '../functions/_lib/assinaturas';
import { onRequestGet as callback } from '../functions/api/callback';
import type { D1Database, D1PreparedStatement, Env } from '../functions/_lib/tipos';

/** D1 de teste sobre o SQLite embutido do Node. Cada chamada é assíncrona, como no D1 real. */
function d1(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_assinaturas.sql', import.meta.url), 'utf8'));
  const stmt = (sql: string, args: unknown[] = []): D1PreparedStatement => {
    const conv = sql.replace(/\?(\d+)/g, '?');
    const ordem = [...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]) - 1);
    const vals = () => ordem.map((i) => args[i] as never);
    return {
      bind: (...v) => stmt(sql, v),
      first: async <T,>() => (await Promise.resolve(), (db.prepare(conv).get(...vals()) as T) ?? null),
      all: async <T,>() => (await Promise.resolve(), { results: db.prepare(conv).all(...vals()) as T[], meta: { changes: 0 } }),
      run: async () => {
        await Promise.resolve();
        const r = db.prepare(conv).run(...vals());
        return { results: [], meta: { changes: Number(r.changes) } };
      },
    };
  };
  return { prepare: (sql) => stmt(sql) };
}

const base = (extra: Partial<Entrada> = {}): Entrada => ({
  campanha: 'patinetes', nome: 'Maria da Silva', email: 'maria@exemplo.com', bairro: 'Centro',
  consentimento: true, aceitaOutros: false, token: 't', ...extra,
});

describe('validar', () => {
  it('normaliza e aceita um formulário completo', () => {
    const { entrada } = validar({ campanha: 'patinetes', nome: '  Maria   da Silva ', email: 'Maria@Exemplo.COM', consentimento: 'on' });
    expect(entrada?.nome).toBe('Maria da Silva');
    expect(entrada?.email).toBe('maria@exemplo.com');
    expect(entrada?.aceitaOutros).toBe(false);
    expect(entrada?.bairro).toBeNull();
  });
  it('exige consentimento', () => {
    expect(validar({ campanha: 'x', nome: 'Maria', email: 'm@e.com' }).erro).toMatch(/concordância/);
  });
  it('recusa e-mail e nome inválidos e campanha fora do padrão', () => {
    expect(validar({ campanha: 'x', nome: 'Maria', email: 'sem-arroba', consentimento: 'on' }).erro).toMatch(/e-mail/);
    expect(validar({ campanha: 'x', nome: '12', email: 'm@e.com', consentimento: 'on' }).erro).toMatch(/nome/);
    expect(validar({ campanha: '../etc', nome: 'Maria', email: 'm@e.com', consentimento: 'on' }).erro).toMatch(/Campanha/);
  });
});

describe('gravar', () => {
  let db: D1Database;
  beforeEach(() => { db = d1(); });

  it('a segunda assinatura do mesmo e-mail não conta de novo', async () => {
    expect(await gravar(db, base(), 'ip1')).toEqual({ ok: true, status: 'assinada' });
    expect(await gravar(db, base({ nome: 'Outra Pessoa' }), 'ip2')).toEqual({ ok: true, status: 'repetida' });
    expect(await contar(db, 'patinetes')).toBe(1);
  });

  it('concorrência: assinaturas simultâneas e repetidas viram uma linha por e-mail e campanha', async () => {
    // Propriedade testada com 30 sorteios: o total gravado é sempre o número de pares distintos (campanha, e-mail).
    for (let rodada = 0; rodada < 30; rodada++) {
      const banco = d1();
      const pedidos = Array.from({ length: 40 }, () => base({
        campanha: ['a', 'b'][Math.floor(Math.random() * 2)],
        email: `p${Math.floor(Math.random() * 12)}@exemplo.com`,
      }));
      const ips = pedidos.map((_, i) => `ip${i}`); // IPs diferentes para não esbarrar no limite por IP
      const res = await Promise.all(pedidos.map((p, i) => gravar(banco, p, ips[i])));
      const distintos = new Set(pedidos.map((p) => `${p.campanha}|${p.email}`)).size;
      expect(res.filter((r) => r.ok && r.status === 'assinada').length).toBe(distintos);
      expect((await contar(banco, 'a')) + (await contar(banco, 'b'))).toBe(distintos);
    }
  });

  it(`limita a ${LIMITE_POR_IP_HORA} assinaturas por IP por hora`, async () => {
    const t0 = new Date('2026-12-01T12:00:00Z');
    for (let i = 0; i < LIMITE_POR_IP_HORA; i++) {
      expect((await gravar(db, base({ email: `p${i}@e.com` }), 'mesmo-ip', t0)).ok).toBe(true);
    }
    const bloqueada = await gravar(db, base({ email: 'extra@e.com' }), 'mesmo-ip', t0);
    expect(bloqueada).toMatchObject({ ok: false, codigo: 429 });
    const depois = new Date(t0.getTime() + 3601_000);
    expect((await gravar(db, base({ email: 'extra@e.com' }), 'mesmo-ip', depois)).ok).toBe(true);
  });
});

describe('hashIp', () => {
  it('é determinístico, depende do sal e não contém o IP', async () => {
    const a = await hashIp('200.1.2.3', 'sal');
    expect(a).toBe(await hashIp('200.1.2.3', 'sal'));
    expect(a).not.toBe(await hashIp('200.1.2.3', 'outro'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('200.1.2.3');
  });
});

describe('verificarTurnstile', () => {
  const resp = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
  it('sem segredo (desenvolvimento) passa', async () => {
    expect(await verificarTurnstile('', undefined, '1.1.1.1')).toBe('ok');
  });
  it('sucesso e falha do Turnstile', async () => {
    expect(await verificarTurnstile('tk', 's', '1.1.1.1', async () => resp({ success: true }))).toBe('ok');
    expect(await verificarTurnstile('tk', 's', '1.1.1.1', async () => resp({ success: false }))).toBe('invalido');
    expect(await verificarTurnstile('', 's', '1.1.1.1', async () => resp({ success: true }))).toBe('invalido');
  });
  it('serviço fora do ar: tenta duas vezes e recusa (falha fechada)', async () => {
    const f = vi.fn(async () => { throw new Error('rede'); });
    expect(await verificarTurnstile('tk', 's', '1.1.1.1', f as unknown as typeof fetch)).toBe('indisponivel');
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('callback do login', () => {
  const env = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'segredo' } as Env;
  it('recusa state que não bate com o cookie', async () => {
    const req = new Request('https://site.test/api/callback?code=c&state=a', { headers: { Cookie: 'oauth_state=b' } });
    const r = await callback({ request: req, env, params: {} });
    expect(r.status).toBe(400);
    expect(await r.text()).toContain('authorization:github:error');
  });
  it('devolve o token só para a origem do próprio site', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ access_token: 'tok123' })));
    const req = new Request('https://site.test/api/callback?code=c&state=a', { headers: { Cookie: 'oauth_state=a' } });
    const html = await (await callback({ request: req, env, params: {} })).text();
    expect(html).toContain('authorization:github:success');
    expect(html).toContain('"https://site.test"');
    expect(html).not.toContain("'*'");
    f.mockRestore();
  });
});
