import { describe, it, expect, vi } from 'vitest';
import { coord, data, hora, tipo, lerCsv, montar, lerPlanilha, ErroDeDado, type Tabela } from '../functions/_lib/contagens';

const CAB = ['Data', 'Horário', 'Período', 'Latitude', 'Longitude', 'Ciclistas', 'Fonte', 'Local', 'Tipo'];
const LAT = `19°55'15.9"S`, LON = `43°57'08.6"W`;
const linha = (d: string, h: string, p: string, c: number | string, local = 'Ciclovia Augusto de Lima', t = 'Video') =>
  [d, h, p, LAT, LON, String(c), 'Cristiano Scarpelli; Marco Túlio', local, t];
const HORAS_2409 = [6, 1, 2, 0, 1, 3, 7, 22, 32, 14, 17, 19, 10, 19, 22, 11, 18, 32, 49, 40, 20, 17, 10, 8];
const diaInteiro = (d: string, v = HORAS_2409) => v.map((c, h) => linha(d, String(h), '1 hora', c));
const tab = (...linhas: string[][]): Tabela => [CAB, ...linhas];

describe('conversões', () => {
  it('coordenada em graus, minutos e segundos', () => {
    expect(coord(`19°55'21.0"S`, 'latitude')).toBeCloseTo(-19.9225, 4);
    expect(coord(`43°56'47.6"W`, 'longitude')).toBeCloseTo(-43.946556, 4);
    expect(coord('-19.92', 'latitude')).toBe(-19.92);
    expect(() => coord(`23°33'00"S`, 'latitude')).toThrow(ErroDeDado);
  });
  it('data em dd/mm/aaaa e data impossível', () => {
    expect(data('24/09/2026')).toBe('2026-09-24');
    expect(() => data('31/02/2026')).toThrow(/data inválida/);
  });
  it('hora de 0 a 23, com ou sem minutos', () => {
    expect(hora('18')).toBe(18);
    expect(hora('7:00')).toBe(7);
    expect(() => hora('v')).toThrow(/hora inválida/);
    expect(() => hora('24')).toThrow(/fora do intervalo/);
  });
  it('tipo normalizado', () => {
    expect(tipo('Presenciial')).toBe('Presencial');
    expect(tipo('Video')).toBe('Vídeo');
  });
});

describe('lerCsv', () => {
  it('campos entre aspas, com aspas duplicadas, vírgula e quebra de linha', () => {
    const t = lerCsv('﻿a,b,c\r\n1,"19°55\'21.0""S","x, y"\n2,"linha\nnova",\n');
    expect(t).toEqual([['a', 'b', 'c'], ['1', `19°55'21.0"S`, 'x, y'], ['2', 'linha\nnova', '']]);
  });
});

describe('montar', () => {
  it('a soma das horas bate com as linhas agregadas e não duplica contagens', () => {
    const d = '24/09/2026';
    const out = montar(tab(...diaInteiro(d), linha(d, '', '1 hora', 49), linha(d, '', '2 horas', 81), linha(d, '', '12 horas', 265), linha(d, '', '24 horas', 380)));
    expect(out.avisos).toEqual([]);
    expect(Object.fromEntries(out.contagens.map((c) => [c.periodo, c.ciclistas]))).toEqual({ 1: 49, 2: 81, 12: 265, 24: 380 });
    expect(out.contagens).toHaveLength(4);
    expect(out.perfis[0].horas).toEqual(HORAS_2409);
  });
  it('divergência vira aviso e vale a soma das horas', () => {
    const d = '24/09/2026';
    const out = montar(tab(...diaInteiro(d), linha(d, '', '24 horas', 999)));
    expect(out.avisos.some((a) => a.includes('999'))).toBe(true);
    expect(out.contagens.filter((c) => c.periodo === 24).map((c) => c.ciclistas)).toEqual([380]);
  });
  it('dia incompleto não gera a janela de 24 h', () => {
    const out = montar(tab(...diaInteiro('24/09/2026').filter((_, h) => h !== 3)));
    expect(out.contagens.some((c) => c.periodo === 24)).toBe(false);
    expect(out.avisos.some((a) => a.includes('24 h'))).toBe(true);
  });
  it('erro de digitação aponta a linha da planilha', () => {
    const linhas = diaInteiro('11/09/2024');
    linhas[0][1] = 'v'; // o caso real de 24/11/2026
    expect(() => montar(tab(...linhas))).toThrow('Planilha, linha 2: hora inválida: "v"');
  });
  it('hora repetida e número negativo são erros', () => {
    expect(() => montar(tab(...diaInteiro('24/09/2026'), linha('24/09/2026', '5', '1 hora', 3)))).toThrow(/repetida/);
    expect(() => montar(tab(linha('27/04/2023', '', '1 hora', -1)))).toThrow(/fora do intervalo/);
  });
  it('média de ciclistas por hora por ano', () => {
    const out = montar(tab(
      linha('27/04/2023', '', '1 hora', 10, 'Av. X', 'Presencial'),
      linha('28/04/2023', '', '1 hora', 20, 'Av. X', 'Presencial'),
      linha('02/05/2024', '', '1 hora', 33, 'Av. X', 'Presencial'),
    ));
    expect(out.locais[0].mediaHoraPorAno).toEqual({ 2023: 15, 2024: 33 });
    expect(out.locais[0].mediaHora).toBe(33);
  });
  it('formato de três abas (Locais, Hora a hora, Histórico)', () => {
    const locais: Tabela = [['Local', 'Latitude', 'Longitude'], ['Ciclovia Augusto de Lima', LAT, LON]];
    const horas: Tabela = [['Data', 'Hora', 'Local', 'Ciclistas', 'Fonte', 'Tipo'], ...HORAS_2409.map((c, h) => ['24/09/2026', String(h), 'Ciclovia Augusto de Lima', String(c), 'Cristiano Scarpelli', 'Video'])];
    const historico: Tabela = [['Data', 'Período', 'Ciclistas', 'Fonte', 'Local', 'Tipo'], ['27/04/2023', '1 hora', '14', 'Cristiano Scarpelli', 'Ciclovia Augusto de Lima', 'Presencial']];
    const out = montar(historico, horas, locais);
    expect(out.totalContagens).toBe(5);
    expect(out.locais[0].horaAHora).toBe(true);
  });
});

describe('lerPlanilha', () => {
  const csv = (t: string) => new Response(t, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
  it('lê a aba pelo link de exportação', async () => {
    const f = vi.fn(async () => csv([CAB, ...diaInteiro('24/09/2026')].map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')));
    const d = await lerPlanilha({ id: 'abc', abas: { historico: 0 } }, f as unknown as typeof fetch);
    expect(d.perfis).toHaveLength(1);
    expect(String(f.mock.calls[0]?.[0 as never])).toContain('/spreadsheets/d/abc/export?format=csv&gid=0');
  });
  it('planilha não compartilhada por link: o Google devolve HTML de login', async () => {
    const f = vi.fn(async () => new Response('<html>login</html>', { status: 401, headers: { 'Content-Type': 'text/html' } }));
    await expect(lerPlanilha({ id: 'abc', abas: { historico: 0 } }, f as unknown as typeof fetch)).rejects.toThrow(/401/);
    expect(f).toHaveBeenCalledTimes(2); // uma nova tentativa
  });
  it('resposta 200 que não é CSV também é erro', async () => {
    const f = vi.fn(async () => new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    await expect(lerPlanilha({ id: 'abc', abas: { historico: 0 } }, f as unknown as typeof fetch)).rejects.toThrow(/compartilhada por link/);
  });
});
