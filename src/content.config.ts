import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Cada artigo, notícia e campanha mora numa pasta própria (<slug>/index.md) com as imagens ao lado.
// O id da entrada é o nome da pasta, que vira o endereço (/artigo/<slug>/, igual ao WordPress antigo).
const porPasta = (base: string) =>
  glob({
    base,
    pattern: '*/index.md',
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  });

const artigos = defineCollection({
  loader: porPasta('./src/content/artigos'),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      description: z.string().default(''),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      tags: z.array(z.string()).default([]),
      // Local do CicloDados ligado ao artigo (mesmo nome da planilha), opcional
      locais: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      legacyUrl: z.string().optional(),
    }),
});

const noticias = defineCollection({
  loader: porPasta('./src/content/noticias'),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      tipo: z.enum(['Notícia', 'Evento', 'Ação', 'Vídeo', 'CicloArte']).default('Notícia'),
      eventDate: z.coerce.date().optional(),
      place: z.string().optional(),
      description: z.string().default(''),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      externalUrl: z.url().optional(),
      draft: z.boolean().default(false),
    }),
});

const situacao = z.enum(['vitoria', 'parcial', 'revertida', 'andamento', 'sem', 'negado', 'estudo', 'fato']);

const conquistas = defineCollection({
  loader: glob({ base: './src/content/conquistas', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    order: z.number().default(100),
    items: z
      .array(
        z.object({
          date: z.string(), // texto livre: "18/03/2026", "Fim de 2024"
          sortDate: z.coerce.date(),
          title: z.string(),
          text: z.string().default(''),
          status: situacao,
          link: z.string().optional(),
        }),
      )
      .default([]),
    draft: z.boolean().default(false),
  }),
});

const campanhas = defineCollection({
  loader: porPasta('./src/content/campanhas'),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      status: z.enum(['rascunho', 'aberta', 'encerrada']).default('rascunho'),
      bannerText: z.string(), // frase da faixa amarela
      description: z.string(),
      target: z.string().optional(), // a quem a campanha será entregue
      goal: z.number().int().positive().optional(),
      opensAt: z.coerce.date(),
      closesAt: z.coerce.date().optional(),
      cover: image().optional(),
      coverAlt: z.string().optional(),
    }),
});

const paginas = defineCollection({
  loader: glob({ base: './src/content/paginas', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
    updated: z.coerce.date().optional(),
  }),
});

export const collections = { artigos, noticias, conquistas, campanhas, paginas };
