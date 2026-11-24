import { getCollection, type CollectionEntry } from 'astro:content';

const publicado = <T extends { data: { draft?: boolean } }>(e: T) => import.meta.env.DEV || !e.data.draft;

export async function artigos(): Promise<CollectionEntry<'artigos'>[]> {
  return (await getCollection('artigos', publicado)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function noticias(): Promise<CollectionEntry<'noticias'>[]> {
  return (await getCollection('noticias', publicado)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export type Situacao = CollectionEntry<'conquistas'>['data']['items'][number]['status'];

export const SITUACAO: Record<Situacao, { rotulo: string; grupo: 'vitorias' | 'andamento' | 'sem' | 'registros'; cor: string; fundo: string; icone: string }> = {
  vitoria: { rotulo: 'Vitória', grupo: 'vitorias', cor: '#00585F', fundo: '#E1F3F3', icone: 'M2.5 7.5l3 3 6-7' },
  parcial: { rotulo: 'Vitória parcial', grupo: 'vitorias', cor: '#00585F', fundo: '#E1F3F3', icone: 'M2.5 7.5l3 3 6-7' },
  revertida: { rotulo: 'Vitória revertida', grupo: 'sem', cor: '#3D5150', fundo: '#EEF1F1', icone: 'M3 7h8' },
  andamento: { rotulo: 'Em andamento', grupo: 'andamento', cor: '#7A4F00', fundo: '#FFF1D2', icone: 'M7 2.5v4.5l3 2' },
  sem: { rotulo: 'Sem resposta', grupo: 'sem', cor: '#3D5150', fundo: '#EEF1F1', icone: 'M3 7h8' },
  negado: { rotulo: 'Negado', grupo: 'sem', cor: '#3D5150', fundo: '#EEF1F1', icone: 'M3.5 3.5l7 7M10.5 3.5l-7 7' },
  estudo: { rotulo: 'Estudo publicado', grupo: 'registros', cor: '#0B4F8A', fundo: '#E5EEF8', icone: 'M3 11V6M7 11V3M11 11V8' },
  fato: { rotulo: 'Acontecimento', grupo: 'registros', cor: '#3D5150', fundo: '#F1F5F4', icone: 'M7 3.5v4M7 10.5v.1' },
};

export async function conquistas() {
  return (await getCollection('conquistas', publicado)).sort((a, b) => a.data.order - b.data.order);
}

/** O item mais recente de cada luta (sem os de "Acontecimento"), para a página inicial. */
export async function ultimasConquistas(n = 3) {
  const lutas = await conquistas();
  return lutas
    .map((l) => {
      const it = [...l.data.items]
        .filter((i) => i.status !== 'fato')
        .sort((a, b) => b.sortDate.valueOf() - a.sortDate.valueOf())[0];
      return it ? { ...it, luta: l.data.title, lutaId: l.id } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.sortDate.valueOf() - a.sortDate.valueOf())
    .slice(0, n);
}
