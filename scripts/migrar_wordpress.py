#!/usr/bin/env python3
"""Migra os artigos do WordPress antigo do CicloRota BH para Markdown do Astro.

Lê o banco do backup (importado num MySQL local descartável) e a pasta `wp-content/uploads` do mesmo backup.
Para cada post publicado na categoria `artigo`:
  - converte o HTML do Gutenberg em Markdown (pandoc, gfm), mantendo tabelas;
  - troca vídeos do YouTube por iframe do youtube-nocookie;
  - copia as imagens usadas (e a capa) para a pasta do artigo, reduzidas a no máximo 1600 px de largura;
  - reescreve links internos de ciclorotabh.com para caminhos relativos;
  - grava `src/content/artigos/<slug>/index.md` com front matter.

Também grava `scripts/saida/redirecionamentos.txt` com os slugs que mudaram.

Uso:
  python3 -I scripts/migrar_wordpress.py --container ciclorota-wp-tmp \
      --uploads /caminho/para/wp-content/uploads --saida src/content/artigos
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata

from PIL import Image

PREFIXO = "wphb_"
LARGURA_MAX = 1600
DESCRICAO = {
    "nossas-alegacoes-finais-no-processo-da-ciclovia-da-afonso-pena": "As alegações finais do CicloRota BH como amicus curiae na ação civil pública da ciclovia da Afonso Pena, com contagens em vídeo de 12 e 24 horas.",
}
SLUG_NOVO = {
    # slug antigo errado -> slug novo (o antigo vira redirecionamento)
    "teste": "a-ciclovia-da-afonso-pena-em-bh-e-os-argumentos-de-sempre",
    "contagem-de-ciclistas-augusto-de-lima": "react-ao-zap-apocrifo-da-ciclovia-afonso-pena",
}


def sql_json(container, query):
    """Roda uma consulta que devolve uma coluna JSON por linha."""
    out = subprocess.run(
        ["docker", "exec", container, "mysql", "-uroot", "--default-character-set=utf8mb4", "-N", "-B", "--raw", "wp", "-e", query],
        check=True, capture_output=True, text=True,
    ).stdout
    return [json.loads(linha) for linha in out.splitlines() if linha.strip()]


def slugify(texto):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def youtube_id(url):
    m = re.search(r"(?:youtu\.be/|v=|embed/|shorts/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def iframe_youtube(vid):
    return (
        f'<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/{vid}" '
        f'title="Vídeo no YouTube" loading="lazy" allow="encrypted-media; picture-in-picture" '
        f'allowfullscreen></iframe></div>'
    )


def preprocessar(html_wp):
    """Limpa o HTML do Gutenberg antes do pandoc."""
    h = re.sub(r"<!--.*?-->", "", html_wp, flags=re.S)
    h = re.sub(r"<span[^>]*wp-block-cover__background[^>]*>\s*</span>", "", h)
    # Blocos de embed do YouTube: <figure class="wp-block-embed ..."><div ...>URL</div></figure>
    def emb(m):
        vid = youtube_id(m.group(0))
        return f"\n\n{iframe_youtube(vid)}\n\n" if vid else m.group(0)
    h = re.sub(r"<figure[^>]*wp-block-embed[^>]*>.*?</figure>", emb, h, flags=re.S)
    h = re.sub(r"<iframe[^>]*src=\"[^\"]*youtube[^\"]*\"[^>]*>\s*</iframe>", emb, h, flags=re.S)
    return h


def simplificar_imagens(h):
    """O Astro só otimiza imagem em sintaxe Markdown. Desfaz <figure>, deixa no <img> só src e alt
    e transforma a legenda em parágrafo em itálico, para o pandoc gerar ![alt](./arquivo)."""
    def limpa_img(m):
        tag = m.group(0)
        src = re.search(r'\ssrc="([^"]*)"', tag)
        alt = re.search(r'\salt="([^"]*)"', tag)
        if not src:
            return ""
        return f'<img src="{src.group(1)}" alt="{alt.group(1) if alt else ""}">'
    def figura(m):
        corpo = m.group(1)
        imgs = re.findall(r"<img[^>]*>", corpo)
        cap = re.search(r"<figcaption[^>]*>(.*?)</figcaption>", corpo, flags=re.S)
        if not imgs:
            return corpo
        out = "".join(f"<p>{limpa_img(re.match(r'.*', i, flags=re.S))}</p>" for i in imgs)
        if cap and re.sub(r"<[^>]+>", "", cap.group(1)).strip():
            out += f"<p><em>{cap.group(1).strip()}</em></p>"
        return out
    h = re.sub(r"<figure[^>]*>(.*?)</figure>", figura, h, flags=re.S)
    h = re.sub(r"<img[^>]*>", limpa_img, h)
    return h


def tirar_capa_repetida(md, pasta, capa):
    """O WordPress costumava repetir a imagem de destaque no início do texto. Se a primeira imagem do texto
    for o mesmo arquivo da capa (mesmos bytes) e vier antes de qualquer parágrafo, ela sai do texto."""
    import hashlib
    h = lambda f: hashlib.sha256(open(os.path.join(pasta, f), "rb").read()).hexdigest()
    blocos = md.split("\n\n")
    m = re.fullmatch(r"!\[[^\]]*\]\(\./([^)]+)\)\s*", blocos[0]) if blocos else None
    if m and os.path.exists(os.path.join(pasta, m.group(1))) and h(m.group(1)) == h(capa):
        if md.count(f"./{m.group(1)}") == 1:
            os.remove(os.path.join(pasta, m.group(1)))
        resto = blocos[1:]
        # legenda da capa removida ("Imagem: ...", "Foto: ...") também sai
        if resto and re.fullmatch(r"[*_]?(Imagem|Foto|Crédito)s?:[^\n]{0,100}[*_]?\s*", resto[0].strip()):
            resto = resto[1:]
        return "\n\n".join(resto).lstrip()
    return md


def converter(h):
    md = subprocess.run(
        ["pandoc", "-f", "html", "-t", "gfm-raw_attribute", "--wrap=none"],
        input=h, check=True, capture_output=True, text=True,
    ).stdout
    # pandoc escapa o iframe como bloco HTML cru; mantemos. Limpa divs vazias que sobram do Gutenberg.
    md = re.sub(r"^<div[^>]*>\s*$|^</div>\s*$", "", md, flags=re.M)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip() + "\n"


def arquivo_original(uploads, caminho_rel):
    """Acha o arquivo no backup; se for uma miniatura (-1024x576), prefere o original."""
    caminho_rel = caminho_rel.split("?")[0]
    base = os.path.join(uploads, caminho_rel)
    sem_tamanho = re.sub(r"-\d+x\d+(\.[A-Za-z]+)$", r"\1", base)
    for c in (sem_tamanho, base):
        if os.path.exists(c):
            return c
    return None


def copiar_imagem(origem, destino_dir, nome):
    os.makedirs(destino_dir, exist_ok=True)
    ext = os.path.splitext(origem)[1].lower()
    destino = os.path.join(destino_dir, nome + (".jpg" if ext in (".jpeg", ".jpg") else ext))
    if ext in (".gif", ".svg", ".webp"):
        shutil.copy2(origem, destino)
        return os.path.basename(destino)
    im = Image.open(origem)
    if im.width > LARGURA_MAX:
        im = im.resize((LARGURA_MAX, round(im.height * LARGURA_MAX / im.width)), Image.Resampling.LANCZOS)
    if ext == ".png":
        im.save(destino, optimize=True)
    else:
        im.convert("RGB").save(destino, quality=82, optimize=True, progressive=True)
    return os.path.basename(destino)


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)


def resumo(md):
    for par in md.split("\n\n"):
        t = re.sub(r"!\[[^\]]*\]\([^)]*\)|<[^>]+>|[*_`>#]", "", par)
        t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
        t = re.sub(r"\s+", " ", t.replace("\\", "")).strip()
        letras = [c for c in t if c.isalpha()]
        if letras and sum(c.isupper() for c in letras) / len(letras) > 0.6:
            continue
        if len(t) > 60:
            return (t[:157].rsplit(" ", 1)[0] + "…") if len(t) > 160 else t
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--container", required=True)
    ap.add_argument("--uploads", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--so", help="migrar só este slug (teste)")
    a = ap.parse_args()

    posts = sql_json(a.container, f"""
        select json_object('id', p.ID, 'slug', p.post_name, 'titulo', p.post_title, 'data', p.post_date,
          'modificado', p.post_modified, 'html', p.post_content, 'excerpt', p.post_excerpt,
          'capa', (select m2.meta_value from {PREFIXO}postmeta m join {PREFIXO}postmeta m2
                   on m2.post_id = m.meta_value and m2.meta_key = '_wp_attached_file'
                   where m.post_id = p.ID and m.meta_key = '_thumbnail_id' limit 1),
          'capa_alt', (select m2.meta_value from {PREFIXO}postmeta m join {PREFIXO}postmeta m2
                   on m2.post_id = m.meta_value and m2.meta_key = '_wp_attachment_image_alt'
                   where m.post_id = p.ID and m.meta_key = '_thumbnail_id' limit 1),
          'tags', (select json_arrayagg(t2.name) from {PREFIXO}term_relationships r2
                   join {PREFIXO}term_taxonomy x2 on x2.term_taxonomy_id = r2.term_taxonomy_id and x2.taxonomy = 'post_tag'
                   join {PREFIXO}terms t2 on t2.term_id = x2.term_id where r2.object_id = p.ID))
        from {PREFIXO}posts p
        join {PREFIXO}term_relationships r on r.object_id = p.ID
        join {PREFIXO}term_taxonomy x on x.term_taxonomy_id = r.term_taxonomy_id and x.taxonomy = 'category'
        join {PREFIXO}terms t on t.term_id = x.term_id
        where p.post_type = 'post' and p.post_status = 'publish' and t.slug = 'artigo'
        order by p.post_date""")

    redirs = []
    faltando = []
    for p in posts:
        slug_antigo = p["slug"]
        slug = SLUG_NOVO.get(slug_antigo, slug_antigo)
        if a.so and slug != a.so:
            continue
        if slug != slug_antigo:
            redirs.append((f"/artigo/{slug_antigo}/", f"/artigo/{slug}/"))
        pasta = os.path.join(a.saida, slug)
        if os.path.isdir(pasta):
            shutil.rmtree(pasta)
        os.makedirs(pasta)

        h = preprocessar(p["html"])
        # Imagens: troca cada URL de upload por um arquivo local numerado
        mapa = {}
        def troca_img(m):
            url = html.unescape(m.group(1))
            rel = re.sub(r"^.*?/wp-content/uploads/", "", url)
            if rel == url:
                return m.group(0)
            if rel not in mapa:
                orig = arquivo_original(a.uploads, rel)
                if not orig:
                    faltando.append((slug, rel))
                    return m.group(0)
                mapa[rel] = copiar_imagem(orig, pasta, f"imagem-{len(mapa) + 1:02d}")
            return m.group(0).replace(m.group(1), "./" + mapa[rel])
        h = re.sub(r'<img[^>]*?\ssrc="([^"]+)"', troca_img, h)
        h = re.sub(r'\ssrcset="[^"]*"|\ssizes="[^"]*"', "", h)
        # Links internos
        h = re.sub(r'https?://(?:www\.)?ciclorotabh\.com(/[^"\s]*)', r"\1", h)
        h = re.sub(r'href="/artigo/(teste|contagem-de-ciclistas-augusto-de-lima)/"',
                   lambda m: f'href="/artigo/{SLUG_NOVO[m.group(1)]}/"', h)

        h = simplificar_imagens(h)
        md = converter(h)
        capa = None
        if p.get("capa"):
            orig = arquivo_original(a.uploads, p["capa"])
            if orig:
                capa = copiar_imagem(orig, pasta, "capa")
            else:
                faltando.append((slug, p["capa"]))

        if capa:
            md = tirar_capa_repetida(md, pasta, capa)
        fm = ["---", f"title: {yaml_str(html.unescape(p['titulo']).strip())}",
              f"date: {p['data'][:10]}", f"updated: {p['modificado'][:10]}"]
        desc = DESCRICAO.get(slug) or re.sub(r"\s+", " ", html.unescape(p.get("excerpt") or "")).strip() or resumo(md)
        fm.append(f"description: {yaml_str(desc)}")
        if capa:
            fm.append(f"cover: ./{capa}")
            fm.append(f"coverAlt: {yaml_str((p.get('capa_alt') or html.unescape(p['titulo'])).strip())}")
        tags = [html.unescape(t) for t in (p.get("tags") or [])]
        if tags:
            fm.append("tags: [" + ", ".join(yaml_str(t) for t in tags) + "]")
        fm.append(f"legacyUrl: {yaml_str('/artigo/' + slug_antigo + '/')}")
        fm.append("---")
        with open(os.path.join(pasta, "index.md"), "w", encoding="utf-8") as f:
            f.write("\n".join(fm) + "\n\n" + md)
        print(f"{slug}: {len(md.split())} palavras, {len(mapa)} imagens, capa={'sim' if capa else 'não'}")

    os.makedirs("scripts/saida", exist_ok=True)
    with open("scripts/saida/redirecionamentos.txt", "w", encoding="utf-8") as f:
        for de, para in redirs:
            f.write(f"{de} {para} 301\n")
    if faltando:
        print("IMAGENS NÃO ACHADAS:", faltando, file=sys.stderr)


if __name__ == "__main__":
    main()
