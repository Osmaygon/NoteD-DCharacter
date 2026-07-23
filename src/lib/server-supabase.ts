import { neon } from "@neondatabase/serverless";

type RpcArgs = Record<string, unknown>;
type RpcResult<T = unknown> = { data: T | null; error: { message: string } | null };

type PgArg = { proname: string; arg_names: string[] | null; arg_types: string[] | null };

let sqlClient: ReturnType<typeof neon> | null = null;
const argCache = new Map<string, string[]>();

function databaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");
  return url;
}

function sql() {
  sqlClient ??= neon(databaseUrl());
  return sqlClient;
}

function normalizeRpcData(name: string, rows: Record<string, unknown>[]): unknown {
  if (rows.length === 1 && Object.keys(rows[0]).length === 1 && Object.prototype.hasOwnProperty.call(rows[0], name)) {
    return rows[0][name];
  }
  return rows;
}

async function rpcArgNames(name: string, args: RpcArgs): Promise<string[]> {
  const cacheKey = `${name}:${Object.keys(args).sort().join(",")}`;
  const cached = argCache.get(cacheKey);
  if (cached) return cached;

  const rows = await sql()`
    select p.proname,
           p.proargnames as arg_names,
           coalesce(array_agg(t.typname order by u.ordinality) filter (where t.typname is not null), '{}') as arg_types
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join unnest(p.proargtypes) with ordinality as u(type_oid, ordinality) on true
    left join pg_type t on t.oid = u.type_oid
    where n.nspname = 'public' and p.proname = ${name}
    group by p.oid, p.proname, p.proargnames
    order by cardinality(p.proargtypes) desc
  ` as PgArg[];

  const candidates = rows
    .map((row) => (row.arg_names ?? []).filter((arg) => arg.startsWith("p_")))
    .filter((names) => names.length === Object.keys(args).length && names.every((arg) => Object.prototype.hasOwnProperty.call(args, arg)));

  const names = candidates[0];
  if (!names) throw new Error(`RPC no encontrada o argumentos incompatibles: ${name}`);
  argCache.set(cacheKey, names);
  return names;
}

export function createServerSupabase() {
  return {
    async rpc<T = unknown>(name: string, args: RpcArgs = {}): Promise<RpcResult<T>> {
      try {
        const names = await rpcArgNames(name, args);
        const placeholders = names.map((arg, index) => `${arg} => $${index + 1}`).join(", ");
        const query = `select * from public.${name}(${placeholders})`;
        const values = names.map((arg) => args[arg]);
        const rows = await sql().query(query, values) as Record<string, unknown>[];
        return { data: normalizeRpcData(name, rows) as T, error: null };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : "Error de base de datos" } };
      }
    },
  };
}
