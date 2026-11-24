#!/usr/bin/env python3
"""Gera src/data/contagens.json a partir da planilha de contagens do CicloRota BH.

Aceita dois formatos de planilha:
  1. Uma aba (formato atual): Ano, Data, [Horário], Período, Latitude, Longitude, Ciclistas, Fonte, Local, Tipo.
     Linhas com Horário são contagens de 1 hora daquela hora de início.
  2. Três abas: "Locais" (Local, Latitude, Longitude), "Hora a hora" (Data, Hora, Local, Ciclistas, Fonte, Tipo)
     e "Histórico" (o formato 1, congelado).

Fontes de entrada (uma das duas):
  --xlsx arquivo.xlsx
  --csv-historico URL [--csv-horas URL] [--csv-locais URL]   (planilha publicada na Web como CSV)

Regras:
  - Dias com contagem hora a hora geram as janelas fixas (JANELAS) e substituem as linhas agregadas do mesmo dia e
    local. Se a soma divergir da linha agregada, entra um aviso no JSON e a soma das horas vale.
  - Erro de dado (coordenada fora de BH, número negativo, data inválida) interrompe sem sobrescrever o JSON atual.
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict

# Janelas confirmadas nas contagens de setembro de 2026 da Ciclovia Augusto de Lima (hora inicial, hora final).
JANELAS = {1: (18, 19), 2: (17, 19), 12: (7, 19), 24: (0, 24)}
BH = {"lat": (-20.10, -19.70), "lon": (-44.10, -43.80)}
TIPOS = {"video": "Vídeo", "vídeo": "Vídeo", "presencial": "Presencial", "presenciial": "Presencial"}


class ErroDeDado(Exception):
    pass


def slug(texto):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def coord(valor, eixo):
    """Converte 19°55'21.0"S ou -19.9225 em graus decimais e confere se cai em BH."""
    if valor is None or str(valor).strip() == "":
        raise ErroDeDado(f"{eixo} vazia")
    if isinstance(valor, (int, float)):
        x = float(valor)
    else:
        s = str(valor).strip().replace(",", ".")
        m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*(?:\"|'')?\s*([NSEWLO])\s*$", s, re.I)
        if m:
            g, mi, se, h = m.groups()
            x = float(g) + float(mi or 0) / 60 + float(se or 0) / 3600
            if h.upper() in ("S", "W", "O"):
                x = -x
        else:
            try:
                x = float(s)
            except ValueError:
                raise ErroDeDado(f"{eixo} ilegível: {valor!r}")
    lo, hi = BH["lat" if eixo == "latitude" else "lon"]
    if not lo <= x <= hi:
        raise ErroDeDado(f"{eixo} fora de BH: {valor!r} -> {x}")
    return round(x, 6)


def data(valor):
    if isinstance(valor, dt.datetime):
        return valor.date()
    if isinstance(valor, dt.date):
        return valor
    s = str(valor or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    raise ErroDeDado(f"data inválida: {valor!r}")


def inteiro(valor, campo, minimo=0, maximo=None):
    try:
        n = int(round(float(str(valor).replace(",", "."))))
    except (TypeError, ValueError):
        raise ErroDeDado(f"{campo} inválido: {valor!r}")
    if n < minimo or (maximo is not None and n > maximo):
        raise ErroDeDado(f"{campo} fora do intervalo: {n}")
    return n


def periodo(valor):
    m = re.match(r"^\s*(\d+)", str(valor or ""))
    if not m:
        raise ErroDeDado(f"período inválido: {valor!r}")
    return int(m.group(1))


def hora(valor):
    if isinstance(valor, dt.time):
        return valor.hour
    if isinstance(valor, dt.datetime):
        return valor.hour
    s = str(valor).strip()
    m = re.match(r"^(\d{1,2})(?::\d{2})?(?:h)?$", s.replace(".0", ""))
    if not m:
        raise ErroDeDado(f"hora inválida: {valor!r}")
    return inteiro(m.group(1), "hora", 0, 23)


def tipo(valor):
    return TIPOS.get(str(valor or "").strip().lower(), str(valor or "").strip() or "Não informado")


def fontes(valor):
    return [f.strip() for f in str(valor or "").split(";") if f.strip()]


def norm_header(h):
    return slug(str(h or "")).replace("-", "")


# ---------- leitura ----------

def linhas_de_tabela(cabecalho, linhas):
    chaves = [norm_header(h) for h in cabecalho]
    for n, linha in enumerate(linhas, start=2):
        if not any(v not in (None, "") for v in linha):
            continue
        yield n, dict(zip(chaves, linha))


def ler_xlsx(caminho):
    import openpyxl  # só no uso local
    wb = openpyxl.load_workbook(caminho, data_only=True)
    abas = {}
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if rows:
            abas[norm_header(ws.title)] = (rows[0], rows[1:])
    return abas


def ler_csv_url(url):
    with urllib.request.urlopen(url, timeout=30) as r:  # noqa: S310 (URL vem da configuração do repositório)
        texto = r.read().decode("utf-8")
    rows = list(csv.reader(io.StringIO(texto)))
    return rows[0], rows[1:]


# ---------- montagem ----------

def montar(historico, horas=None, locais_tab=None):
    """historico/horas/locais_tab: (cabecalho, linhas). Devolve o dicionário do JSON."""
    avisos = []
    locais = {}

    def registra_local(nome, lat, lon, onde):
        nome = str(nome or "").strip()
        if not nome:
            raise ErroDeDado(f"{onde}: local vazio")
        la, lo = coord(lat, "latitude"), coord(lon, "longitude")
        if nome in locais and (abs(locais[nome]["lat"] - la) > 0.0005 or abs(locais[nome]["lon"] - lo) > 0.0005):
            avisos.append(f"{onde}: '{nome}' com coordenada diferente da primeira ocorrência")
        locais.setdefault(nome, {"id": slug(nome), "nome": nome, "lat": la, "lon": lo})
        return nome

    if locais_tab:
        for n, r in linhas_de_tabela(*locais_tab):
            registra_local(r.get("local"), r.get("latitude"), r.get("longitude"), f"Locais, linha {n}")

    agregadas = []
    horarias = defaultdict(dict)  # (data, local) -> {hora: (ciclistas, tipo, fontes)}

    def entra_hora(d, h, nome, c, t, f, onde):
        chave = (d, nome)
        if h in horarias[chave]:
            raise ErroDeDado(f"{onde}: hora {h} repetida em {d} {nome}")
        horarias[chave][h] = (c, t, f)

    for n, r in linhas_de_tabela(*historico):
        onde = f"Histórico, linha {n}"
        try:
            nome = registra_local(r.get("local"), r.get("latitude"), r.get("longitude"), onde) if r.get("latitude") not in (None, "") else str(r.get("local") or "").strip()
            if nome not in locais:
                raise ErroDeDado(f"local sem coordenada: {nome!r}")
            d = data(r.get("data"))
            c = inteiro(r.get("ciclistas"), "ciclistas")
            h_val = r.get("horario", r.get("hora"))
            if h_val not in (None, ""):
                entra_hora(d, hora(h_val), nome, c, tipo(r.get("tipo")), fontes(r.get("fonte")), onde)
            else:
                agregadas.append({"data": d, "periodo": periodo(r.get("periodo")), "local": nome, "ciclistas": c,
                                  "tipo": tipo(r.get("tipo")), "fonte": fontes(r.get("fonte"))})
        except ErroDeDado as e:
            raise ErroDeDado(f"{onde}: {e}") from None

    if horas:
        for n, r in linhas_de_tabela(*horas):
            onde = f"Hora a hora, linha {n}"
            try:
                nome = str(r.get("local") or "").strip()
                if nome not in locais:
                    raise ErroDeDado(f"local não cadastrado na aba Locais: {nome!r}")
                entra_hora(data(r.get("data")), hora(r.get("hora", r.get("horario"))), nome,
                           inteiro(r.get("ciclistas"), "ciclistas"), tipo(r.get("tipo")), fontes(r.get("fonte")), onde)
            except ErroDeDado as e:
                raise ErroDeDado(f"{onde}: {e}") from None

    # Janelas derivadas dos dias com hora a hora
    derivadas, perfis = [], []
    for (d, nome), hs in sorted(horarias.items()):
        quaisquer = next(iter(hs.values()))
        perfis.append({"local": locais[nome]["id"], "data": d.isoformat(),
                       "horas": [hs[h][0] if h in hs else None for h in range(24)],
                       "tipo": quaisquer[1], "fonte": quaisquer[2]})
        for p, (ini, fim) in JANELAS.items():
            if all(h in hs for h in range(ini, fim)):
                derivadas.append({"data": d, "periodo": p, "local": nome,
                                  "ciclistas": sum(hs[h][0] for h in range(ini, fim)),
                                  "tipo": quaisquer[1], "fonte": quaisquer[2], "derivada": True})
            else:
                avisos.append(f"{d.strftime('%d/%m/%Y')} {nome}: faltam horas para a janela de {p} h")

    chaves_derivadas = {(x["data"], x["local"], x["periodo"]): x for x in derivadas}
    finais = []
    for x in agregadas:
        dv = chaves_derivadas.get((x["data"], x["local"], x["periodo"]))
        if dv is None:
            finais.append(x)
        elif dv["ciclistas"] != x["ciclistas"]:
            avisos.append(f"{x['data'].strftime('%d/%m/%Y')} {x['local']}, {x['periodo']} h: planilha diz {x['ciclistas']}, soma das horas dá {dv['ciclistas']}")
    finais.extend(derivadas)
    finais.sort(key=lambda x: (x["data"], x["local"], x["periodo"]))

    # Estatísticas por local
    por_local = defaultdict(list)
    for x in finais:
        por_local[x["local"]].append(x)
    saida_locais = []
    for nome, loc in sorted(locais.items()):
        cs = por_local.get(nome, [])
        if not cs:
            continue
        media_ano = {}
        for ano in sorted({x["data"].year for x in cs}):
            uma = [x["ciclistas"] for x in cs if x["periodo"] == 1 and x["data"].year == ano]
            if uma:
                media_ano[str(ano)] = round(sum(uma) / len(uma), 1)
        max24 = max((x for x in cs if x["periodo"] == 24), key=lambda x: x["ciclistas"], default=None)
        ultimo = max(media_ano) if media_ano else None
        saida_locais.append({
            **loc,
            "contagens": len(cs),
            "anos": sorted({x["data"].year for x in cs}),
            "mediaHoraPorAno": media_ano,
            "ultimoAno": ultimo,
            "mediaHora": media_ano.get(ultimo) if ultimo else None,
            "max24h": {"ciclistas": max24["ciclistas"], "data": max24["data"].isoformat()} if max24 else None,
            "periodos": sorted({x["periodo"] for x in cs}),
            "horaAHora": any(p["local"] == loc["id"] for p in perfis),
            "ultimaContagem": max(x["data"] for x in cs).isoformat(),
        })

    return {
        "geradoEm": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "janelas": {str(k): list(v) for k, v in JANELAS.items()},
        "totalContagens": len(finais),
        "primeiraData": finais[0]["data"].isoformat() if finais else None,
        "ultimaData": finais[-1]["data"].isoformat() if finais else None,
        "locais": saida_locais,
        "contagens": [{**{k: v for k, v in x.items() if k != "data"}, "data": x["data"].isoformat(),
                       "local": locais[x["local"]]["id"], "derivada": x.get("derivada", False)} for x in finais],
        "perfis": perfis,
        "avisos": avisos,
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx")
    ap.add_argument("--csv-historico")
    ap.add_argument("--csv-horas")
    ap.add_argument("--csv-locais")
    ap.add_argument("--saida", default="src/data/contagens.json")
    a = ap.parse_args(argv)
    try:
        if a.xlsx:
            abas = ler_xlsx(a.xlsx)
            if "locais" in abas:
                hist = abas.get("historico") or next(v for k, v in abas.items() if k not in ("locais", "horaahora"))
                dados = montar(hist, abas.get("horaahora"), abas["locais"])
            else:
                dados = montar(next(iter(abas.values())))
        elif a.csv_historico:
            dados = montar(ler_csv_url(a.csv_historico),
                           ler_csv_url(a.csv_horas) if a.csv_horas else None,
                           ler_csv_url(a.csv_locais) if a.csv_locais else None)
        else:
            ap.error("informe --xlsx ou --csv-historico")
    except ErroDeDado as e:
        print(f"ERRO na planilha: {e}. O arquivo {a.saida} não foi alterado.", file=sys.stderr)
        return 1
    tmp = a.saida + ".tmp"
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, a.saida)
    print(f"{a.saida}: {dados['totalContagens']} contagens, {len(dados['locais'])} locais, "
          f"{len(dados['perfis'])} dias hora a hora, {len(dados['avisos'])} avisos")
    for av in dados["avisos"]:
        print("  aviso:", av)
    return 0


if __name__ == "__main__":
    sys.exit(main())
