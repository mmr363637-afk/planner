import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";
/** Real PostgreSQL engine in WASM; no live Supabase connection or credentials. */
it("migration is idempotent; CAS/history/RLS prevent stale and cross-user writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
    await db.exec(readFileSync("supabase/setup.sql", "utf8"));
    const migration = readFileSync("supabase/safe-sync.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(
      `set role authenticated; select set_config('app.uid','00000000-0000-0000-0000-000000000001',false);`,
    );
    const save = (rev: number) =>
      db.query(
        `select public.save_planner_state($1,'{"subjects":[],"topics":[]}') as result`,
        [rev],
      );
    await save(0);
    await expect(save(0)).rejects.toThrow("planner_conflict");
    const concurrent = await Promise.allSettled([save(1), save(1)]);
    expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      db.query(`update public.user_states set state='{}'`),
    ).rejects.toThrow(/permission denied/);
    for (let n = 2; n < 12; n++) await save(n);
    const history = await db.query<{ n: number }>(
      "select count(*)::int as n from public.user_state_versions",
    );
    expect(history.rows[0].n).toBe(8);
    await db.exec(
      `select set_config('app.uid','00000000-0000-0000-0000-000000000002',false);`,
    );
    expect(
      (await db.query("select * from public.user_states")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.user_state_versions")).rows,
    ).toHaveLength(0);
    await expect(save(12)).rejects.toThrow("planner_conflict");
    await save(0); // second user gets an independent revision stream
  } finally {
    await db.close();
  }
}, 30000);
