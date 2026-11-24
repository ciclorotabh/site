// Atualiza src/data/contagens.json (o retrato usado se o Google falhar no build) a partir da planilha ao vivo.
// Uso: node scripts/retrato-contagens.mjs   (Node 24 lê o .ts direto)
import { writeFileSync } from 'node:fs';
import { lerPlanilha } from '../functions/_lib/contagens.ts';
import { SITE } from '../src/lib/site.ts';

const dados = await lerPlanilha(SITE.planilha);
writeFileSync(new URL('../src/data/contagens.json', import.meta.url), JSON.stringify(dados, null, 1) + '\n');
console.log(`retrato: ${dados.totalContagens} contagens, ${dados.locais.length} locais, ${dados.avisos.length} avisos`);
