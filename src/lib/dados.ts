import { lerPlanilha, type Dados } from '../../functions/_lib/contagens';
import retrato from '../data/contagens.json';
import { SITE } from './site';

export type Carga = { dados: Dados; fonte: 'planilha' | 'retrato'; erro?: string };

let carga: Promise<Carga> | null = null;

/** Contagens para o build: lê a planilha ao vivo; se falhar, usa o retrato salvo em src/data/contagens.json. */
export function carregarContagens(): Promise<Carga> {
  carga ??= (async (): Promise<Carga> => {
    try {
      return { dados: await lerPlanilha(SITE.planilha), fonte: 'planilha' };
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      console.warn(`[contagens] usando o retrato salvo: ${erro}`);
      return { dados: retrato as unknown as Dados, fonte: 'retrato', erro };
    }
  })();
  return carga;
}
