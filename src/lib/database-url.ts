/**
 * Resolve a Postgres connection string from deploy env.
 *
 * Vercel Marketplace / Storage Neon injects `POSTGRES_URL`, not `DATABASE_URL`.
 * Parade Tim Kerja also has no Vercel env vars to copy — operators create a
 * Neon store on this project or paste a URI from console.neon.tech.
 */
const CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

export function getDatabaseUrl(
  env: NodeJS.ProcessEnv | undefined = typeof process !== "undefined"
    ? process.env
    : undefined,
): string | undefined {
  if (!env) return undefined;
  for (const key of CANDIDATES) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}
