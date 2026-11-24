// Converte a planilha de contagens do CicloRota BH no formato que o site usa.
// Usado no build (retrato inicial da página) e na função /api/contagens (leitura ao vivo).
//
// Formatos aceitos:
//  1. Uma aba: Data, [Horário], Período, Latitude, Longitude, Ciclistas, Fonte, Local, Tipo (Ano é ignorado).
//     Linhas com Horário são contagens de 1 hora daquela hora de início.
//  2. Três abas: "Locais" (Local, Latitude, Longitude), "Hora a hora" (Data, Hora, Local, Ciclistas, Fonte, Tipo)
//     e "Histórico" (formato 1).
//
// Regras: dias com hora a hora geram as janelas fixas (JANELAS) e substituem as linhas agregadas do mesmo dia e
// local; soma divergente vira aviso e a soma das horas vale. Erro de dado lança ErroDeDado com a linha da planilha.

export const JANELAS: Record<number, [number, number]> = { 1: [18, 19], 2: [17, 19], 12: [7, 19], 24: [0, 24] };
const BH = { lat: [-20.1, -19.7], lon: [-44.1, -43.8] } as const;
const TIPOS: Record<string, string> = { video: 'Vídeo', 'vídeo': 'Vídeo', presencial: 'Presencial', presenciial: 'Presencial' };

export class ErroDeDado extends Error {}

export type Local = {
  id: string; nome: string; lat: number; lon: number;
  contagens: number; anos: number[]; mediaHoraPorAno: Record<string, number>;
  ultimoAno: string | null; mediaHora: number | null;
  max24h: { ciclistas: number; data: string } | null;
  periodos: number[]; horaAHora: boolean; ultimaContagem: string;
};
export type Contagem = { data: string; periodo: number; local: string; ciclistas: number; tipo: string; fonte: string[]; derivada: boolean };
export type Perfil = { local: string; data: string; horas: (number | null)[]; tipo: string; fonte: string[] };
export type Dados = {
  geradoEm: string; janelas: Record<string, [number, number]>; totalContagens: number;
  primeiraData: string | null; ultimaData: string | null;
  locais: Local[]; contagens: Contagem[]; perfis: Perfil[]; avisos: string[];
};
export type Tabela = string[][]; // primeira linha = cabeçalho

// ---------- leitura de CSV (RFC 4180) ----------

export function lerCsv(texto: string): Tabela {
  const linhas: Tabela = [];
  let campo = '', linha: string[] = [], aspas = false;
  const s = texto.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

// ---------- normalização ----------

export function slug(texto: string): string {
  return texto.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const chave = (h: string) => slug(h).replace(/-/g, '');

export function coord(valor: string, eixo: 'latitude' | 'longitude'): number {
  const s = String(valor ?? '').trim().replace(',', '.');
  if (!s) throw new ErroDeDado(`${eixo} vazia`);
  let x: number;
  const m = /^(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*(?:"|'')?\s*([NSEWLO])$/i.exec(s);
  if (m) {
    x = Number(m[1]) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600;
    if (/[SWO]/i.test(m[4])) x = -x;
  } else {
    x = Number(s);
    if (!Number.isFinite(x)) throw new ErroDeDado(`${eixo} ilegível: "${valor}"`);
  }
  const [lo, hi] = eixo === 'latitude' ? BH.lat : BH.lon;
  if (x < lo || x > hi) throw new ErroDeDado(`${eixo} fora de BH: "${valor}"`);
  return Math.round(x * 1e6) / 1e6;
}

/** "24/09/2026", "2026-09-24" ou "24/09/26" -> "2026-09-24" */
export function data(valor: string): string {
  const s = String(valor ?? '').trim();
  let a: number, m: number, d: number;
  let r = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (r) { d = +r[1]; m = +r[2]; a = +r[3]; if (a < 100) a += 2000; }
  else if ((r = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) { a = +r[1]; m = +r[2]; d = +r[3]; }
  else throw new ErroDeDado(`data inválida: "${valor}"`);
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new ErroDeDado(`data inválida: "${valor}"`);
  return dt.toISOString().slice(0, 10);
}

export function inteiro(valor: string, campo: string, min = 0, max?: number): number {
  const n = Number(String(valor ?? '').trim().replace(/\./g, '').replace(',', '.'));
  if (String(valor ?? '').trim() === '' || !Number.isFinite(n)) throw new ErroDeDado(`${campo} inválido: "${valor}"`);
  const r = Math.round(n);
  if (r < min || (max !== undefined && r > max)) throw new ErroDeDado(`${campo} fora do intervalo: ${r}`);
  return r;
}

export function periodo(valor: string): number {
  const m = /^\s*(\d+)/.exec(String(valor ?? ''));
  if (!m) throw new ErroDeDado(`período inválido: "${valor}"`);
  return Number(m[1]);
}

export function hora(valor: string): number {
  const m = /^(\d{1,2})(?::\d{2})?h?$/.exec(String(valor ?? '').trim());
  if (!m) throw new ErroDeDado(`hora inválida: "${valor}"`);
  return inteiro(m[1], 'hora', 0, 23);
}

export const tipo = (v: string) => TIPOS[String(v ?? '').trim().toLowerCase()] ?? (String(v ?? '').trim() || 'Não informado');
export const fontes = (v: string) => String(v ?? '').split(';').map((f) => f.trim()).filter(Boolean);

function* registros(t: Tabela | undefined, aba: string) {
  if (!t || !t.length) return;
  const cab = t[0].map(chave);
  for (let i = 1; i < t.length; i++) {
    if (!t[i].some((v) => String(v ?? '').trim() !== '')) continue;
    const r: Record<string, string> = {};
    cab.forEach((k, j) => (r[k] = t[i][j] ?? ''));
    yield { onde: `${aba}, linha ${i + 1}`, r };
  }
}

// ---------- montagem ----------

export function montar(historico: Tabela, horas?: Tabela, locaisTab?: Tabela, agora = new Date()): Dados {
  const avisos: string[] = [];
  const locais = new Map<string, { id: string; nome: string; lat: number; lon: number }>();
  const registraLocal = (nome: string, lat: string, lon: string, onde: string) => {
    nome = String(nome ?? '').trim();
    if (!nome) throw new ErroDeDado(`${onde}: local vazio`);
    const la = coord(lat, 'latitude'), lo = coord(lon, 'longitude');
    const ja = locais.get(nome);
    if (ja && (Math.abs(ja.lat - la) > 0.0005 || Math.abs(ja.lon - lo) > 0.0005)) avisos.push(`${onde}: "${nome}" com coordenada diferente da primeira ocorrência`);
    if (!ja) locais.set(nome, { id: slug(nome), nome, lat: la, lon: lo });
    return nome;
  };
  const comLinha = <T,>(onde: string, f: () => T): T => {
    try { return f(); } catch (e) {
      if (e instanceof ErroDeDado && !e.message.startsWith(onde)) throw new ErroDeDado(`${onde}: ${e.message}`);
      throw e;
    }
  };

  for (const { onde, r } of registros(locaisTab, 'Locais')) comLinha(onde, () => registraLocal(r.local, r.latitude, r.longitude, onde));

  type Agregada = { data: string; periodo: number; local: string; ciclistas: number; tipo: string; fonte: string[]; derivada?: boolean };
  const agregadas: Agregada[] = [];
  const horarias = new Map<string, Map<number, { c: number; tipo: string; fonte: string[] }>>(); // "data|local"
  const entraHora = (d: string, h: number, nome: string, c: number, t: string, f: string[], onde: string) => {
    const k = `${d}|${nome}`;
    const m = horarias.get(k) ?? new Map();
    if (m.has(h)) throw new ErroDeDado(`${onde}: hora ${h} repetida em ${d.split('-').reverse().join('/')} ${nome}`);
    m.set(h, { c, tipo: t, fonte: f });
    horarias.set(k, m);
  };

  const nomeHistorico = horas || locaisTab ? 'Histórico' : 'Planilha';
  for (const { onde, r } of registros(historico, nomeHistorico)) {
    comLinha(onde, () => {
      const nome = String(r.latitude ?? '').trim() ? registraLocal(r.local, r.latitude, r.longitude, onde) : String(r.local ?? '').trim();
      if (!locais.has(nome)) throw new ErroDeDado(`local sem coordenada: "${nome}"`);
      const d = data(r.data);
      const c = inteiro(r.ciclistas, 'ciclistas');
      const h = r.horario ?? r.hora ?? '';
      if (String(h).trim() !== '') entraHora(d, hora(h), nome, c, tipo(r.tipo), fontes(r.fonte), onde);
      else agregadas.push({ data: d, periodo: periodo(r.periodo), local: nome, ciclistas: c, tipo: tipo(r.tipo), fonte: fontes(r.fonte) });
    });
  }
  for (const { onde, r } of registros(horas, 'Hora a hora')) {
    comLinha(onde, () => {
      const nome = String(r.local ?? '').trim();
      if (!locais.has(nome)) throw new ErroDeDado(`local não cadastrado na aba Locais: "${nome}"`);
      entraHora(data(r.data), hora(r.hora ?? r.horario), nome, inteiro(r.ciclistas, 'ciclistas'), tipo(r.tipo), fontes(r.fonte), onde);
    });
  }

  const derivadas: Agregada[] = [];
  const perfis: Perfil[] = [];
  for (const k of [...horarias.keys()].sort()) {
    const [d, nome] = k.split('|');
    const hs = horarias.get(k)!;
    const q = hs.values().next().value!;
    perfis.push({ local: locais.get(nome)!.id, data: d, horas: Array.from({ length: 24 }, (_, h) => hs.get(h)?.c ?? null), tipo: q.tipo, fonte: q.fonte });
    for (const [p, [ini, fim]] of Object.entries(JANELAS)) {
      const faixa = Array.from({ length: fim - ini }, (_, i) => ini + i);
      if (faixa.every((h) => hs.has(h))) {
        derivadas.push({ data: d, periodo: Number(p), local: nome, ciclistas: faixa.reduce((s, h) => s + hs.get(h)!.c, 0), tipo: q.tipo, fonte: q.fonte, derivada: true });
      } else {
        avisos.push(`${d.split('-').reverse().join('/')} ${nome}: faltam horas para a janela de ${p} h`);
      }
    }
  }

  const porChave = new Map(derivadas.map((x) => [`${x.data}|${x.local}|${x.periodo}`, x]));
  const finais: Agregada[] = [];
  for (const x of agregadas) {
    const dv = porChave.get(`${x.data}|${x.local}|${x.periodo}`);
    if (!dv) finais.push(x);
    else if (dv.ciclistas !== x.ciclistas) avisos.push(`${x.data.split('-').reverse().join('/')} ${x.local}, ${x.periodo} h: planilha diz ${x.ciclistas}, soma das horas dá ${dv.ciclistas}`);
  }
  finais.push(...derivadas);
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  finais.sort((a, b) => cmp(a.data, b.data) || cmp(a.local, b.local) || a.periodo - b.periodo);

  const porLocal = new Map<string, Agregada[]>();
  for (const x of finais) porLocal.set(x.local, [...(porLocal.get(x.local) ?? []), x]);
  const saidaLocais: Local[] = [];
  for (const nome of [...locais.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const loc = locais.get(nome)!;
    const cs = porLocal.get(nome) ?? [];
    if (!cs.length) continue;
    const anos = [...new Set(cs.map((x) => Number(x.data.slice(0, 4))))].sort();
    const mediaHoraPorAno: Record<string, number> = {};
    for (const a of anos) {
      const uma = cs.filter((x) => x.periodo === 1 && Number(x.data.slice(0, 4)) === a).map((x) => x.ciclistas);
      if (uma.length) mediaHoraPorAno[String(a)] = Math.round((uma.reduce((s, v) => s + v, 0) / uma.length) * 10) / 10;
    }
    const ultimoAno = Object.keys(mediaHoraPorAno).sort().at(-1) ?? null;
    const max24 = cs.filter((x) => x.periodo === 24).reduce<Agregada | null>((m, x) => (!m || x.ciclistas > m.ciclistas ? x : m), null);
    saidaLocais.push({
      ...loc, contagens: cs.length, anos, mediaHoraPorAno, ultimoAno,
      mediaHora: ultimoAno ? mediaHoraPorAno[ultimoAno] : null,
      max24h: max24 ? { ciclistas: max24.ciclistas, data: max24.data } : null,
      periodos: [...new Set(cs.map((x) => x.periodo))].sort((a, b) => a - b),
      horaAHora: perfis.some((p) => p.local === loc.id),
      ultimaContagem: cs.map((x) => x.data).sort().at(-1)!,
    });
  }

  return {
    geradoEm: agora.toISOString().replace(/\.\d{3}Z$/, '+00:00'),
    janelas: Object.fromEntries(Object.entries(JANELAS).map(([k, v]) => [k, v])),
    totalContagens: finais.length,
    primeiraData: finais[0]?.data ?? null,
    ultimaData: finais.at(-1)?.data ?? null,
    locais: saidaLocais,
    contagens: finais.map((x) => ({ data: x.data, periodo: x.periodo, local: locais.get(x.local)!.id, ciclistas: x.ciclistas, tipo: x.tipo, fonte: x.fonte, derivada: !!x.derivada })),
    perfis,
    avisos,
  };
}

// ---------- leitura da planilha pelo link de exportação ----------

export type Planilha = { id: string; abas: { historico: number; horas?: number; locais?: number } };

export const urlAba = (id: string, gid: number) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${gid}`;

/** Baixa as abas (com tempo limite e uma nova tentativa) e monta os dados. Lança erro se não conseguir. */
export async function lerPlanilha(p: Planilha, buscar: typeof fetch = fetch): Promise<Dados> {
  const baixar = async (gid: number): Promise<Tabela> => {
    let ultimo: unknown;
    for (let t = 0; t < 2; t++) {
      try {
        const r = await buscar(urlAba(p.id, gid), { signal: AbortSignal.timeout(8000), redirect: 'follow' });
        if (!r.ok) throw new Error(`Google respondeu ${r.status}`);
        const tipoResp = r.headers.get('Content-Type') ?? '';
        if (!tipoResp.includes('csv')) throw new Error('a planilha não está compartilhada por link (o Google pediu login)');
        return lerCsv(await r.text());
      } catch (e) {
        ultimo = e;
        if (t === 0) await new Promise((res) => setTimeout(res, 400));
      }
    }
    throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
  };
  const [hist, horas, locais] = await Promise.all([
    baixar(p.abas.historico),
    p.abas.horas !== undefined ? baixar(p.abas.horas) : Promise.resolve(undefined),
    p.abas.locais !== undefined ? baixar(p.abas.locais) : Promise.resolve(undefined),
  ]);
  return montar(hist, horas, locais);
}
