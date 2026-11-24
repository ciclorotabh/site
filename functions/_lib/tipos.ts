// Tipos mínimos do D1 e do ambiente das Pages Functions (só o que este projeto usa).
export interface D1Result<T = unknown> {
  results: T[];
  meta: { changes: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  /** Arquivos estáticos do próprio site (binding automático das Pages). */
  ASSETS: { fetch(input: Request | string): Promise<Response> };
  /** Sal do hash do IP (segredo). */
  IP_SALT: string;
  /** Segredo do Turnstile. Vazio = sem verificação (só em desenvolvimento). */
  TURNSTILE_SECRET?: string;
  /** OAuth App do GitHub para o painel. */
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Organização cujos membros podem exportar assinaturas. */
  GITHUB_ORG: string;
}

export interface Contexto<P extends string = string> {
  request: Request;
  env: Env;
  params: Record<P, string>;
  waitUntil?: (p: Promise<unknown>) => void;
}

/** Cache da borda da Cloudflare (caches.default). Pode não existir fora dela. */
export interface CacheBorda {
  match(r: Request): Promise<Response | undefined>;
  put(r: Request, res: Response): Promise<void>;
}
