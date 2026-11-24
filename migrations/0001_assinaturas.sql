-- Assinaturas das campanhas (abaixo-assinados). Uma assinatura por e-mail em cada campanha.
-- O IP não é guardado: só um hash com sal (ip_hash), usado para limitar assinaturas em massa.
CREATE TABLE IF NOT EXISTS assinaturas (
  id INTEGER PRIMARY KEY,
  campanha TEXT NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  bairro TEXT,
  aceita_outros INTEGER NOT NULL DEFAULT 0,
  versao_termo TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (campanha, email)
);
CREATE INDEX IF NOT EXISTS idx_assinaturas_ip ON assinaturas (ip_hash, criado_em);
CREATE INDEX IF NOT EXISTS idx_assinaturas_campanha ON assinaturas (campanha, criado_em);
