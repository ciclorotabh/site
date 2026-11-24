# CicloRota BH

Site do [CicloRota BH](https://ciclorotabh.com): contagens de ciclistas, artigos e as lutas por uma Belo Horizonte
melhor para quem pedala. Projeto independente de Cristiano Scarpelli.

## Endereços

- Site: https://ciclorotabh.com (até o domínio ser apontado: https://ciclorotabh.pages.dev)
- Painel: `/admin/` · Lista de assinaturas: `/admin/assinaturas.html`
- Hospedagem: Cloudflare Pages, projeto `ciclorotabh`, na conta do Cristiano. Banco D1 `ciclorotabh-assinaturas`.
- Login do painel: OAuth App "Painel CicloRota BH" na organização `ciclorotabh` do GitHub. A URL de callback
  precisa ser `https://<domínio do site>/api/callback`; trocar quando o domínio mudar.

## Como publicar

Pelo painel em `https://ciclorotabh.com/admin/`, com o login do GitHub. Cada publicação vira um commit neste
repositório, e a Cloudflare põe o site novo no ar em 1 ou 2 minutos. Notícias, artigos, conquistas, campanhas e a
política de privacidade são editáveis pelo painel.

## As contagens (CicloDados)

A planilha do Google é a fonte. A Action `atualizar-contagens` lê a planilha publicada como CSV uma vez por dia,
converte para `src/data/contagens.json` e faz o commit se algo mudou. Se a planilha tiver erro (coordenada fora de
BH, número negativo, data inválida), a Action falha e o JSON antigo continua valendo.

Formato aceito: uma aba (`Ano, Data, Horário, Período, Latitude, Longitude, Ciclistas, Fonte, Local, Tipo`) ou três
abas (`Locais`, `Hora a hora`, `Histórico`). Linhas com horário são contagens de 1 hora; o script soma as janelas de
1 h (18h às 19h), 2 h (17h às 19h), 12 h (7h às 19h) e 24 h e confere com as linhas agregadas do mesmo dia.

Rodar à mão: `python3 scripts/atualizar_contagens.py --xlsx planilha.xlsx` ou `--csv-historico URL`.

## Campanhas (abaixo-assinados)

Pages Functions em `functions/api/` com banco D1 (`migrations/`). Uma assinatura por e-mail em cada campanha
(garantido pelo banco), Cloudflare Turnstile contra robô e no máximo 5 assinaturas por conexão por hora. O IP não
é gravado, só um hash com sal. A lista para entrega sai em `/admin/assinaturas.html`, só para membros da organização.

## Desenvolvimento

```sh
nvm use            # Node 24
npm install
npm run dev        # site em http://localhost:4321
npm test           # testes das funções (vitest)
python3 -m unittest discover -s scripts/tests   # testes do gerador de contagens
npm run build      # checagem de tipos e build
```

O conteúdo do WordPress antigo foi migrado em novembro de 2026 por `scripts/migrar_wordpress.py`.
