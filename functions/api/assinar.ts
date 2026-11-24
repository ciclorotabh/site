import { validar, hashIp, verificarTurnstile, gravar } from '../_lib/assinaturas';
import { json, campanhasAbertas } from '../_lib/http';
import type { Contexto } from '../_lib/tipos';

// POST /api/assinar  (formulário da página da campanha)
export async function onRequestPost({ request, env }: Contexto): Promise<Response> {
  let dados: Record<string, unknown>;
  try {
    const tipo = request.headers.get('Content-Type') ?? '';
    dados = tipo.includes('application/json')
      ? ((await request.json()) as Record<string, unknown>)
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    return json({ ok: false, erro: 'Formulário inválido.' }, 400);
  }
  const { entrada, erro } = validar(dados);
  if (!entrada) return json({ ok: false, erro }, 400);

  const abertas = await campanhasAbertas(env, request.url);
  if (!abertas.some((c) => c.id === entrada.campanha)) {
    return json({ ok: false, erro: 'Esta campanha não está recebendo assinaturas.' }, 404);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
  const turnstile = await verificarTurnstile(entrada.token, env.TURNSTILE_SECRET, ip);
  if (turnstile === 'invalido') return json({ ok: false, erro: 'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.' }, 400);
  if (turnstile === 'indisponivel') return json({ ok: false, erro: 'O sistema está instável agora. Tente de novo em alguns minutos.' }, 503);

  const r = await gravar(env.DB, entrada, await hashIp(ip, env.IP_SALT));
  if (!r.ok) return json({ ok: false, erro: r.erro }, r.codigo);
  return json({ ok: true, status: r.status });
}
