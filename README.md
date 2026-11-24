# CicloRota BH

Site do [CicloRota BH](https://ciclorotabh.com): contagens de ciclistas, artigos e as lutas por uma Belo Horizonte
melhor para quem pedala. Projeto independente de Cristiano Scarpelli.

## Endereços

- Site: https://ciclorotabh.com (até o domínio ser apontado: https://ciclorotabh.pages.dev)
- Painel: `/admin/` · Lista de assinaturas: `/admin/assinaturas`
- Hospedagem: Cloudflare Pages, projeto `ciclorotabh`, na conta do Cristiano. Banco D1 `ciclorotabh-assinaturas`.
- Login do painel: OAuth App "Painel CicloRota BH" na organização `ciclorotabh` do GitHub. A URL de callback
  precisa ser `https://<domínio do site>/api/callback`; trocar quando o domínio mudar.

## Como publicar

Pelo painel em `https://ciclorotabh.com/admin/`, com o login do GitHub. Cada publicação vira um commit neste
repositório, e a Cloudflare põe o site novo no ar em 1 ou 2 minutos. Notícias, artigos, conquistas, campanhas e a
política de privacidade são editáveis pelo painel.

## As contagens (CicloDados)

A planilha do Google do Cristiano é a fonte, compartilhada por link como Leitor (sem credencial). O endereço dela
está em `src/lib/site.ts` (`planilha`). O mesmo código (`functions/_lib/contagens.ts`) é usado em dois lugares:

- no build, para a página já sair com os números (se o Google falhar, usa o retrato `src/data/contagens.json`);
- na função `/api/contagens`, que a página consulta ao abrir. Ela lê a planilha ao vivo, guarda por 5 minutos e,
  se a planilha falhar ou tiver erro, devolve o retrato do último build.

Um erro na planilha (data inválida, hora que não é número, coordenada fora de BH) faz o site ignorar a planilha
inteira e manter os dados anteriores. A página `/admin/planilha` mostra o erro com o número da linha.

Formato: uma aba (`Data, Horário, Período, Latitude, Longitude, Ciclistas, Fonte, Local, Tipo`) ou três abas
(`Locais`, `Hora a hora`, `Histórico`). Linhas com horário são contagens de 1 hora; o código soma as janelas de
1 h (18h às 19h), 2 h (17h às 19h), 12 h (7h às 19h) e 24 h e confere com as linhas agregadas do mesmo dia.

Atualizar o retrato: `npm run retrato`.

## Campanhas (abaixo-assinados)

Pages Functions em `functions/api/` com banco D1 (`migrations/`). Uma assinatura por e-mail em cada campanha
(garantido pelo banco), Cloudflare Turnstile contra robô e no máximo 5 assinaturas por conexão por hora. O IP não
é gravado, só um hash com sal. A lista para entrega sai em `/admin/assinaturas`, só para membros da organização.

## Desenvolvimento

```sh
nvm use            # Node 24
npm install
npm run dev        # site em http://localhost:4321
npm test           # testes das funções (vitest)
npm run build      # checagem de tipos e build
```

O conteúdo do WordPress antigo foi migrado em novembro de 2026 por `scripts/migrar_wordpress.py`.
