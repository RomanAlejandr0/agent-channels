import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir, chmod } from "node:fs/promises";
export interface Queryable {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
}
export class Database implements Queryable {
  private local?: PGlite;
  private pool?: pg.Pool;
  private queue: Promise<unknown> = Promise.resolve();
  static async open(dir: string, url?: string) {
    const db = new Database();
    if (url) db.pool = new pg.Pool({ connectionString: url, max: 5 });
    else {
      if (dir !== "memory://") {
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await chmod(dir, 0o700);
      }
      db.local = new PGlite(dir);
      await db.local.waitReady;
    }
    if (db.pool) await db.pool.query(schema);
    else await db.local!.exec(schema);
    return db;
  }
  async query<T = any>(
    sql: string,
    params: any[] = [],
  ): Promise<{ rows: T[] }> {
    if (this.pool)
      return (await this.pool.query(sql, params)) as unknown as { rows: T[] };
    return this.local!.query<T>(sql, params);
  }
  async transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    // One embedded PostgreSQL connection: serialize complete transactions.
    const run = this.queue.then(() => this.local!.transaction((tx) => fn(tx)));
    this.queue = run.catch(() => {});
    return run;
  }
  async close() {
    await this.queue;
    if (this.pool) await this.pool.end();
    if (this.local) await this.local.close();
  }
}
const schema = `
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','member')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), csrf text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
 id text PRIMARY KEY, name text NOT NULL UNIQUE, description text NOT NULL DEFAULT '',
 paused boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS human_members (
 channel_id text REFERENCES channels(id), user_id text REFERENCES users(id),
 PRIMARY KEY(channel_id,user_id)
);
CREATE TABLE IF NOT EXISTS invites (
 hash text PRIMARY KEY, email text NOT NULL, channel_id text REFERENCES channels(id),
 expires_at timestamptz NOT NULL, used_at timestamptz, created_by text REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS agents (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), name text NOT NULL,
 revoked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_members (
 channel_id text REFERENCES channels(id), agent_id text REFERENCES agents(id),
 permission text NOT NULL CHECK(permission IN ('read','write')),
 PRIMARY KEY(channel_id,agent_id)
);
CREATE TABLE IF NOT EXISTS tokens (
 hash text PRIMARY KEY, agent_id text NOT NULL REFERENCES agents(id), client_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('access','refresh')), expires_at timestamptz NOT NULL,
 resource text NOT NULL, family text NOT NULL
);
CREATE INDEX IF NOT EXISTS token_agent ON tokens(agent_id);
CREATE TABLE IF NOT EXISTS messages (
 seq bigserial UNIQUE NOT NULL, id text PRIMARY KEY, channel_id text NOT NULL REFERENCES channels(id),
 agent_id text REFERENCES agents(id), user_id text REFERENCES users(id), body text NOT NULL,
 reply_to text REFERENCES messages(id), mentions jsonb NOT NULL DEFAULT '[]',
 operation_id text NOT NULL, fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((agent_id IS NOT NULL)::int + (user_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS message_agent_operation ON messages(agent_id,operation_id) WHERE agent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS message_user_operation ON messages(user_id,operation_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_channel_seq ON messages(channel_id,seq);
CREATE TABLE IF NOT EXISTS deliveries (
 agent_id text REFERENCES agents(id), message_id text REFERENCES messages(id),
 offered_at timestamptz, received_at timestamptz,
 PRIMARY KEY(agent_id,message_id)
);
CREATE TABLE IF NOT EXISTS audit (
 seq bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL,
 target text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oauth_clients (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_requests (
 id text PRIMARY KEY, client_id text NOT NULL, params jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_codes (
 hash text PRIMARY KEY, client_id text NOT NULL, agent_id text REFERENCES agents(id),
 params jsonb NOT NULL, expires_at timestamptz NOT NULL
);
`;
