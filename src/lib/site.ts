// Configuração do site num lugar só. Para trocar um link, edite aqui.
export const SITE = {
  name: 'CicloRota BH',
  url: 'https://ciclorotabh.com',
  description:
    'Contagens de ciclistas, artigos com fonte e ações nos órgãos públicos por uma Belo Horizonte melhor para quem pedala.',
  owner: 'Cristiano Scarpelli',
  instagram: 'https://www.instagram.com/ciclorotabh/',
  youtube: 'https://www.youtube.com/@Cristiano.Scarpelli',
  // Endereço da publicação no Substack (ex.: https://ciclorotabh.substack.com). Vazio = formulário escondido.
  substack: 'https://cristianoscarpelli.substack.com',
  // Chave pública do Cloudflare Turnstile (anti-robô das campanhas). Vazia = formulário sem a verificação.
  turnstileSiteKey: '',
  // Apoiador mostrado no rodapé. Vazio = sem apoio. (Tirar se o site passar a servir a uma campanha eleitoral.)
  apoio: { nome: 'Habilicita', url: 'https://habilicita.com.br' },
  // Planilha de contagens (Google Planilhas do Cristiano, compartilhada por link como Leitor).
  // gid = número da aba (aparece no endereço como #gid=...). Três abas: preencher horas e locais.
  planilha: {
    id: '1htdqUzUmyvhuZDPoeGkxxA4BPKtKpVSpXAdg12GVy7s',
    abas: { historico: 0 } as { historico: number; horas?: number; locais?: number },
  },
};

// Ordem pedida pelo Cristiano em 23/11/2026. "Grupos de pedal" ficou para depois.
export const NAV = [
  { href: '/ciclodados/', label: 'CicloDados' },
  { href: '/noticias/', label: 'Notícias' },
  { href: '/artigos/', label: 'Artigos' },
  { href: '/conquistas/', label: 'Conquistas' },
];

const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 18/03/2026 (datas do conteúdo são gravadas sem fuso; usamos UTC para não voltar um dia). */
export function dataCurta(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** 18 de março de 2026 */
export function dataLonga(d: Date): string {
  return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Minutos de leitura, a 220 palavras por minuto. */
export function minutosLeitura(texto: string | undefined): number {
  const palavras = (texto ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 220));
}

export function numeroBR(n: number, casas = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
