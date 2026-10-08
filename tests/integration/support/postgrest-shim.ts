/**
 * Phase 6 integration harness — PostgREST transport shim.
 *
 * The application talks to Supabase through `@supabase/supabase-js`, which
 * speaks HTTP to PostgREST. Tests cannot reach a hosted PostgREST, so this
 * module implements the PostgREST semantics the app actually uses — directly
 * over the real PostgreSQL database from `pg-harness.ts`.
 *
 * What is real here: SQL execution, the schema, CHECK/FK/UNIQUE constraints,
 * triggers, RLS. What is shimmed: the HTTP/JSON transport layer.
 *
 * Supported (the complete surface the app uses, verified by
 * tests/integration/service-role-audit.test.ts):
 *   select(cols, {count, head}) | eq | neq | in | is | gt | gte | lt | lte
 *   like | ilike | or | not(col, in, (a,b)) | order | limit | range
 *   single | maybeSingle | then
 *   insert | update | delete | upsert({onConflict})
 *   rpc(name, namedArgs)
 *   storage.from(bucket).createSignedUrl/upload/remove/list
 *   channel()/removeChannel() — an in-process stand-in, NOT live Realtime
 *
 * Every executed statement is recorded in `audit`, which is what makes the
 * service-role ownership regression checks possible.
 */
import type { SqlExecutor } from "./pg-harness";

export interface PostgrestError {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
}

export interface QueryResult<T = Row> {
  data: T | T[] | null;
  error: PostgrestError | null;
  count?: number | null;
}

export type Row = Record<string, unknown>;

export interface AuditEntry {
  table: string;
  op: string;
  sql: string;
  params: unknown[];
  columns: string[];
  filters: string[];
}

interface FilterDesc {
  col: string;
  op: string;
  value: unknown;
}

interface OrderDesc {
  col: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

const IDENT = /^[a-z_][a-z0-9_]*$/i;

/** Operator names as PostgREST reports them, so the audit reads like the API. */
const POSTGREST_OP: Record<string, string> = {
  "=": "eq",
  "<>": "neq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
  is: "is",
  in: "in",
  like: "like",
  ilike: "ilike",
  "not.in": "not.in",
  or: "or",
};

function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`harness: refusing unsafe identifier "${name}"`);
  return `"${name}"`;
}

function isPlainObject(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toPostgrestError(error: unknown): PostgrestError {
  if (isPlainObject(error)) {
    const e = error as { code?: unknown; message?: unknown; detail?: unknown; hint?: unknown };
    if (typeof e.message === "string") {
      return {
        message: e.message,
        code: typeof e.code === "string" ? e.code : "P0001",
        details: typeof e.detail === "string" ? e.detail : null,
        hint: typeof e.hint === "string" ? e.hint : null,
      };
    }
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    code: "P0001",
    details: null,
    hint: null,
  };
}

const PGRST116: PostgrestError = {
  message: "JSON object requested, multiple (or no) rows returned",
  code: "PGRST116",
  details: "Results contain 0 rows",
  hint: null,
};

class QueryBuilder<T = Row> implements PromiseLike<QueryResult<T>> {
  private phase: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns: string[] | null = null;
  private returning: string[] | null = null;
  private rows: Row[] = [];
  private updatePatch: Row | null = null;
  private conflictTarget: string[] | null = null;
  private filters: FilterDesc[] = [];
  private orders: OrderDesc[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private countMode: "exact" | null = null;
  private headOnly = false;

  constructor(
    private readonly sql: SqlExecutor,
    private readonly audit: AuditEntry[],
    private readonly table: string
  ) {}

  private clone(): this {
    return this;
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): this {
    if (this.phase === "select") this.columns = this.parseColumns(columns);
    else this.returning = this.parseColumns(columns);
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.headOnly = true;
    return this.clone();
  }

  private parseColumns(columns: string): string[] {
    if (columns === "*") return ["*"];
    if (columns.includes("(") || columns.includes("!")) {
      throw new Error(
        `harness: embedded resource selects are not supported ("${columns}"). ` +
          "Add support in tests/integration/support/postgrest-shim.ts or avoid the join."
      );
    }
    const cols = columns
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cols.length === 0) throw new Error(`harness: empty column list "${columns}"`);
    cols.forEach(quoteIdent);
    return cols;
  }

  // ── filters ─────────────────────────────────────────────────────────────
  eq(col: string, value: unknown): this {
    this.filters.push({ col, op: "=", value });
    return this.clone();
  }
  neq(col: string, value: unknown): this {
    this.filters.push({ col, op: "<>", value });
    return this.clone();
  }
  gt(col: string, value: unknown): this {
    this.filters.push({ col, op: ">", value });
    return this.clone();
  }
  gte(col: string, value: unknown): this {
    this.filters.push({ col, op: ">=", value });
    return this.clone();
  }
  lt(col: string, value: unknown): this {
    this.filters.push({ col, op: "<", value });
    return this.clone();
  }
  lte(col: string, value: unknown): this {
    this.filters.push({ col, op: "<=", value });
    return this.clone();
  }
  like(col: string, value: string): this {
    this.filters.push({ col, op: "like", value });
    return this.clone();
  }
  ilike(col: string, value: string): this {
    this.filters.push({ col, op: "ilike", value });
    return this.clone();
  }
  is(col: string, value: null | boolean): this {
    this.filters.push({ col, op: "is", value });
    return this.clone();
  }
  in(col: string, values: readonly unknown[]): this {
    this.filters.push({ col, op: "in", value: values });
    return this.clone();
  }
  /** PostgREST `.not("status", "in", "(a,b)")` — negation of a filter. */
  not(col: string, op: string, value: unknown): this {
    this.filters.push({ col, op: `not.${op}`, value });
    return this.clone();
  }
  /** PostgREST `.or("a.eq.1,b.gte.2")` — a disjunction of filters. */
  or(expression: string): this {
    this.filters.push({ col: "__or__", op: "or", value: expression });
    return this.clone();
  }
  filter(col: string, op: string, value: unknown): this {
    this.filters.push({ col, op, value });
    return this.clone();
  }
  match(criteria: Row): this {
    for (const [col, value] of Object.entries(criteria)) this.eq(col, value);
    return this.clone();
  }

  order(col: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orders.push({
      col,
      ascending: options?.ascending !== false,
      nullsFirst: options?.nullsFirst,
    });
    return this.clone();
  }
  limit(count: number): this {
    this.limitCount = count;
    return this.clone();
  }
  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this.clone();
  }

  single(): PromiseLike<QueryResult<T>> {
    this.wantSingle = true;
    return this;
  }
  maybeSingle(): PromiseLike<QueryResult<T>> {
    this.wantMaybeSingle = true;
    return this;
  }

  // ── mutations ───────────────────────────────────────────────────────────
  insert(rows: Row | Row[]): this {
    this.phase = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this.clone();
  }
  update(patch: Row): this {
    this.phase = "update";
    this.updatePatch = patch;
    return this.clone();
  }
  delete(): this {
    this.phase = "delete";
    return this.clone();
  }
  upsert(rows: Row | Row[], options?: { onConflict?: string }): this {
    this.phase = "upsert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.conflictTarget = options?.onConflict
      ? options.onConflict.split(",").map((c) => c.trim())
      : null;
    return this.clone();
  }

  // ── SQL generation ──────────────────────────────────────────────────────
  private buildWhere(params: unknown[]): string {
    if (this.filters.length === 0) return "";
    const clauses = this.filters.map((f) => this.buildFilter(f, params));
    return ` where ${clauses.join(" and ")}`;
  }

  private buildFilter(filter: FilterDesc, params: unknown[]): string {
    const { col, op, value } = filter;

    if (col === "__or__" && op === "or") {
      const parts = String(value)
        .split(",")
        .map((raw) => {
          const [c, o, ...rest] = raw.trim().split(".");
          const v = rest.join(".");
          return this.compare(quoteIdent(c), o, v, params);
        });
      return `(${parts.join(" or ")})`;
    }

    const column = quoteIdent(col);

    if (op === "is") {
      if (value === null) return `${column} is null`;
      return `${column} is ${value === true ? "true" : "false"}`;
    }
    if (op === "in") {
      const values = Array.isArray(value) ? value : [value];
      if (values.length === 0) return "false";
      const marks = values.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `${column} in (${marks.join(", ")})`;
    }
    if (op === "not.in") {
      const raw = String(value).replace(/^\(|\)$/g, "");
      const values = raw.length === 0 ? [] : raw.split(",").map((s) => s.trim());
      if (values.length === 0) return "true";
      const marks = values.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `${column} not in (${marks.join(", ")})`;
    }
    return this.compare(column, op, value, params);
  }

  private compare(column: string, op: string, value: unknown, params: unknown[]): string {
    const sqlOp = op === "eq" ? "=" : op === "neq" ? "<>" : op;
    const cast = isPlainObject(value) || Array.isArray(value) ? "::jsonb" : "";
    params.push(isPlainObject(value) || Array.isArray(value) ? JSON.stringify(value) : value);
    return `${column} ${sqlOp} $${params.length}${cast}`;
  }

  private buildOrder(): string {
    if (this.orders.length === 0) return "";
    const parts = this.orders.map((o) => {
      const dir = o.ascending ? "asc" : "desc";
      const nulls =
        o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last";
      return `${quoteIdent(o.col)} ${dir}${nulls}`;
    });
    return ` order by ${parts.join(", ")}`;
  }

  private withLimit(base: string): string {
    let out = base;
    if (this.limitCount !== null) out += ` limit ${Math.max(0, Math.trunc(this.limitCount))}`;
    if (this.offsetCount !== null) {
      out += ` offset ${Math.max(0, Math.trunc(this.offsetCount))}`;
      if (this.limitCount === null) out += " limit all";
    }
    return out;
  }

  private async run(): Promise<QueryResult<T>> {
    try {
      switch (this.phase) {
        case "select":
          return await this.runSelect();
        case "insert":
          return await this.runInsert();
        case "upsert":
          return await this.runUpsert();
        case "update":
          return await this.runUpdate();
        case "delete":
          return await this.runDelete();
      }
    } catch (error) {
      return { data: null, error: toPostgrestError(error) };
    }
  }

  private record(op: string, sql: string, params: unknown[]): void {
    this.audit.push({
      table: this.table,
      op,
      sql,
      params,
      columns: this.columns ?? this.returning ?? [],
      filters: this.filters.map(
        (f) => `${f.col}.${POSTGREST_OP[f.op] ?? f.op}`
      ),
    });
  }

  private async runSelect(): Promise<QueryResult<T>> {
    const params: unknown[] = [];
    const where = this.buildWhere(params);

    if (this.countMode === "exact" || this.headOnly) {
      const sql = `select count(*)::int as count from ${quoteIdent(this.table)}${where}`;
      this.record("select.count", sql, params);
      const { rows } = await this.sql.query<{ count: number }>(sql, params);
      return {
        data: this.headOnly ? null : ((await this.fetchRows()) as T[]),
        error: null,
        count: rows[0]?.count ?? 0,
      };
    }

    return { data: (await this.fetchRows()) as T[], error: null };
  }

  private async fetchRows(): Promise<Row[]> {
    const params: unknown[] = [];
    const where = this.buildWhere(params);
    const cols = (this.columns ?? ["*"]).map((c) => (c === "*" ? "*" : quoteIdent(c))).join(", ");
    const sql = this.withLimit(
      `select ${cols} from ${quoteIdent(this.table)}${where}${this.buildOrder()}`
    );
    this.record("select", sql, params);
    const { rows } = await this.sql.query<Row>(sql, params);
    return rows;
  }

  private returningClause(): string {
    if (!this.returning) return "";
    const cols = this.returning.map((c) => (c === "*" ? "*" : quoteIdent(c))).join(", ");
    return ` returning ${cols}`;
  }

  private async valueRows(): Promise<Row[]> {
    if (this.rows.length === 0) throw new Error("harness: insert called with no rows");
    const keySets = this.rows.map((r) => Object.keys(r).join(","));
    if (new Set(keySets).size !== 1) {
      throw new Error("harness: insert rows must share the same columns");
    }
    return this.rows;
  }

  private async runInsert(): Promise<QueryResult<T>> {
    const rows = await this.valueRows();
    const cols = Object.keys(rows[0]);
    cols.forEach(quoteIdent);
    const params: unknown[] = [];
    const tuples = rows.map((row) => {
      const marks = cols.map((c) => {
        params.push(row[c] === undefined ? null : row[c]);
        return `$${params.length}`;
      });
      return `(${marks.join(", ")})`;
    });
    const sql = `insert into ${quoteIdent(this.table)} (${cols
      .map(quoteIdent)
      .join(", ")}) values ${tuples.join(", ")}${this.returningClause()}`;
    this.record("insert", sql, params);
    const { rows: inserted } = await this.sql.query<Row>(sql, params);
    return { data: this.returning ? (inserted as T[]) : null, error: null };
  }

  private async runUpsert(): Promise<QueryResult<T>> {
    const rows = await this.valueRows();
    const cols = Object.keys(rows[0]);
    cols.forEach(quoteIdent);
    const params: unknown[] = [];
    const tuples = rows.map((row) => {
      const marks = cols.map((c) => {
        params.push(row[c] === undefined ? null : row[c]);
        return `$${params.length}`;
      });
      return `(${marks.join(", ")})`;
    });
    const conflict = this.conflictTarget
      ? ` on conflict (${this.conflictTarget.map(quoteIdent).join(", ")}) do update set ${cols
          .filter((c) => !this.conflictTarget?.includes(c))
          .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`)
          .join(", ")}`
      : " on conflict do nothing";
    const sql = `insert into ${quoteIdent(this.table)} (${cols
      .map(quoteIdent)
      .join(", ")}) values ${tuples.join(", ")}${conflict}${this.returningClause()}`;
    this.record("upsert", sql, params);
    const { rows: upserted } = await this.sql.query<Row>(sql, params);
    return { data: this.returning ? (upserted as T[]) : null, error: null };
  }

  private async runUpdate(): Promise<QueryResult<T>> {
    if (!this.updatePatch) throw new Error("harness: update called without a payload");
    const cols = Object.keys(this.updatePatch);
    cols.forEach(quoteIdent);
    const params: unknown[] = [];
    const sets = cols.map((c) => {
      params.push(this.updatePatch?.[c] === undefined ? null : this.updatePatch[c]);
      return `${quoteIdent(c)} = $${params.length}`;
    });
    const where = this.buildWhere(params);
    const sql = `update ${quoteIdent(this.table)} set ${sets.join(", ")}${where}${this.returningClause()}`;
    this.record("update", sql, params);
    const { rows } = await this.sql.query<Row>(sql, params);
    return { data: this.returning ? (rows as T[]) : null, error: null };
  }

  private async runDelete(): Promise<QueryResult<T>> {
    const params: unknown[] = [];
    const where = this.buildWhere(params);
    const sql = `delete from ${quoteIdent(this.table)}${where}${this.returningClause()}`;
    this.record("delete", sql, params);
    const { rows } = await this.sql.query<Row>(sql, params);
    return { data: this.returning ? (rows as T[]) : null, error: null };
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run()
      .then((result) => {
        if (result.error) return result;
        const rows = result.data as Row[] | null;
        if (this.wantSingle) {
          if (!rows || rows.length !== 1) {
            return { data: null, error: PGRST116, count: result.count ?? null };
          }
          return { data: rows[0] as unknown as T, error: null, count: result.count ?? null };
        }
        if (this.wantMaybeSingle) {
          if (!rows) return { data: null, error: null, count: result.count ?? null };
          if (rows.length > 1) {
            return {
              data: null,
              error: { ...PGRST116, details: `Results contain ${rows.length} rows` },
              count: result.count ?? null,
            };
          }
          return { data: (rows[0] ?? null) as unknown as T, error: null, count: result.count ?? null };
        }
        return result;
      })
      .then(onfulfilled, onrejected);
  }
}

// ── storage ────────────────────────────────────────────────────────────────

export interface SignedUrlRecord {
  bucket: string;
  path: string;
  expiresInSeconds: number;
  expiresAt: number;
  url: string;
}

export interface StorageShim {
  from(bucket: string): {
    createSignedUrl(
      path: string,
      expiresInSeconds: number
    ): Promise<{ data: { signedUrl: string } | null; error: PostgrestError | null }>;
    upload(
      path: string,
      body: unknown,
      options?: { contentType?: string; upsert?: boolean }
    ): Promise<{ data: { path: string } | null; error: PostgrestError | null }>;
    remove(paths: string[]): Promise<{ data: unknown[] | null; error: PostgrestError | null }>;
    list(
      prefix?: string
    ): Promise<{ data: { name: string }[] | null; error: PostgrestError | null }>;
  };
}

function createStorageShim(sql: SqlExecutor, signedUrls: SignedUrlRecord[]): StorageShim {
  return {
    from(bucket: string) {
      return {
        async createSignedUrl(path: string, expiresInSeconds: number) {
          try {
            const { rows } = await sql.query<{ id: string }>(
              "select id from storage.objects where bucket_id = $1 and name = $2",
              [bucket, path]
            );
            if (rows.length === 0) {
              return {
                data: null,
                error: {
                  message: "Object not found",
                  code: "404",
                  details: null,
                  hint: null,
                },
              };
            }
            const expiresAt = Date.now() + expiresInSeconds * 1000;
            const token = Buffer.from(`${bucket}:${path}:${expiresAt}`).toString("base64url");
            const url = `https://storage.harness.local/object/${bucket}/${path}?token=${token}&expires_at=${expiresAt}`;
            signedUrls.push({ bucket, path, expiresInSeconds, expiresAt, url });
            return { data: { signedUrl: url }, error: null };
          } catch (error) {
            return { data: null, error: toPostgrestError(error) };
          }
        },
        async upload(path: string, _body: unknown, _options?: unknown) {
          try {
            await sql.query(
              "insert into storage.objects (bucket_id, name, metadata) values ($1, $2, '{}'::jsonb) on conflict do nothing",
              [bucket, path]
            );
            return { data: { path }, error: null };
          } catch (error) {
            return { data: null, error: toPostgrestError(error) };
          }
        },
        async remove(paths: string[]) {
          try {
            for (const p of paths) {
              await sql.query("delete from storage.objects where bucket_id = $1 and name = $2", [
                bucket,
                p,
              ]);
            }
            return { data: paths.map((p) => ({ name: p })), error: null };
          } catch (error) {
            return { data: null, error: toPostgrestError(error) };
          }
        },
        async list(prefix = "") {
          try {
            const { rows } = await sql.query<{ name: string }>(
              "select name from storage.objects where bucket_id = $1 and name like $2",
              [bucket, `${prefix}%`]
            );
            return { data: rows, error: null };
          } catch (error) {
            return { data: null, error: toPostgrestError(error) };
          }
        },
      };
    },
  };
}

/**
 * Validate a signed URL issued by the storage shim. Used by the storage tests
 * to prove that short-lived URLs actually expire and that URLs are only ever
 * issued for objects the caller is authorized to read.
 */
export function validateSignedUrl(
  url: string,
  signedUri: SignedUrlRecord[],
  now: number = Date.now()
): { valid: boolean; reason: "ok" | "unknown" | "expired" | "object_missing" } {
  const record = signedUri.find((r) => r.url === url);
  if (!record) return { valid: false, reason: "unknown" };
  if (record.expiresAt <= now) return { valid: false, reason: "expired" };
  return { valid: true, reason: "ok" };
}

// ── realtime stand-in ──────────────────────────────────────────────────────

export interface ChannelEvent {
  channel: string;
  type: string;
  event: string;
  payload?: unknown;
}

export interface ChannelShim {
  on(type: string, filter: unknown, callback?: (payload: unknown) => void): ChannelShim;
  subscribe(callback?: (status: string) => void): ChannelShim;
  unsubscribe(): Promise<"ok" | "error" | "timed out">;
  send(args: { type: string; event: string; payload?: unknown }): Promise<"ok" | "error">;
  track(payload?: unknown): Promise<"ok" | "error">;
  presenceState(): Record<string, unknown[]>;
  /** Test-only: deliver an event to this channel's handlers. */
  emit(event: string, payload?: unknown): void;
}

function createChannelShim(name: string, log: ChannelEvent[]): ChannelShim {
  const handlers: { event: string; callback?: (payload: unknown) => void }[] = [];
  const channel: ChannelShim = {
    on(type, filter, callback) {
      const event = typeof filter === "string" ? filter : (filter as { event?: string })?.event;
      handlers.push({ event: event ?? event_from(type), callback });
      log.push({ channel: name, type, event: event ?? event_from(type) });
      return channel;
    },
    subscribe(callback) {
      log.push({ channel: name, type: "subscribe", event: "phx_join" });
      callback?.("SUBSCRIBED");
      return channel;
    },
    async unsubscribe() {
      log.push({ channel: name, type: "unsubscribe", event: "phx_leave" });
      return "ok";
    },
    async send(args) {
      log.push({ channel: name, type: "broadcast", event: args.event, payload: args.payload });
      return "ok";
    },
    async track(payload) {
      log.push({ channel: name, type: "presence", event: "track", payload });
      return "ok";
    },
    presenceState() {
      return {};
    },
    emit(event, payload) {
      for (const h of handlers) {
        if (h.event === event || h.event === "*") h.callback?.(payload);
      }
    },
  };
  return channel;
}

function event_from(type: string): string {
  return type === "broadcast" ? "*" : type;
}

// ── client ─────────────────────────────────────────────────────────────────

export interface SupabaseShim {
  from(table: string): QueryBuilder<Row>;
  rpc(name: string, args?: Row): PromiseLike<QueryResult<Row>>;
  storage: StorageShim;
  channel(name: string, options?: unknown): ChannelShim;
  removeChannel(channel: ChannelShim): Promise<"ok" | "error">;
  /** Every statement the app executed through this client. */
  audit: AuditEntry[];
  signedUrls: SignedUrlRecord[];
  channelLog: ChannelEvent[];
}

export function createSupabaseShim(sql: SqlExecutor): SupabaseShim {
  const audit: AuditEntry[] = [];
  const signedUrls: SignedUrlRecord[] = [];
  const channelLog: ChannelEvent[] = [];

  const client: SupabaseShim = {
    audit,
    signedUrls,
    channelLog,
    from(table: string) {
      return new QueryBuilder<Row>(sql, audit, table);
    },
    rpc(name: string, args: Row = {}) {
      const params: unknown[] = [];
      const entries = Object.entries(args);
      const call =
        entries.length === 0
          ? `${quoteIdent(name)}()`
          : entries
              .map(([key, value]) => {
                params.push(isPlainObject(value) || Array.isArray(value) ? JSON.stringify(value) : value);
                const cast = isPlainObject(value) || Array.isArray(value) ? "::jsonb" : "";
                return `${quoteIdent(key)} := $${params.length}${cast}`;
              })
              .join(", ");
      const sqlText = `select * from ${quoteIdent(name)}(${call})`;
      audit.push({ table: `rpc:${name}`, op: "rpc", sql: sqlText, params, columns: [], filters: [] });
      return {
        then: (onfulfilled, onrejected) =>
          sql
            .query<Row>(sqlText, params)
            .then<QueryResult<Row>>(({ rows }) => ({ data: rows, error: null }))
            .then(onfulfilled, onrejected),
      } as PromiseLike<QueryResult<Row>>;
    },
    storage: createStorageShim(sql, signedUrls),
    channel(name: string) {
      return createChannelShim(name, channelLog);
    },
    async removeChannel(channel: ChannelShim) {
      await channel.unsubscribe();
      return "ok";
    },
  };

  return client;
}
