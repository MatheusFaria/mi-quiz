import assert from "node:assert/strict";
import test from "node:test";
import { connect, ForbiddenError, memoryAdapter } from "../index.js";

const columns = { term1: { type: "string", required: true }, count: { type: "number" } };

test("insert, update, soft delete and restore persist across a reload", async () => {
  const adapter = memoryAdapter();
  const db = connect({ adapter });
  const Term = db.table("terms", columns);
  await db.migrate();
  await Term.load();

  const a = await Term.insert({ term1: "a", count: 1 });
  const b = await Term.insert({ term1: "b" });
  await Term.update(a.id, { count: 2 });
  await Term.remove(b.id);

  const reloaded = connect({ adapter }).table("terms", columns);
  await reloaded.load();
  assert.deepEqual(reloaded.all().map((r) => [r.term1, r.count]), [["a", 2]]);
  assert.equal(reloaded.all({ includeDeleted: true }).length, 2);

  await reloaded.restore(b.id);
  assert.equal(reloaded.count(), 2);
});

test("migrate backfills ids on a legacy tab, adds columns, backs up, and is idempotent", async () => {
  const adapter = memoryAdapter({ terms: [["term1", "count"], ["a", 1], ["b", 2]] });
  const db = connect({ adapter });
  const Term = db.table("terms", columns);
  const migrations = [
    { id: 1, name: "backfill ids", up: (ctx) => ctx.backfill("terms", "id", () => globalThis.crypto.randomUUID()) },
  ];

  assert.deepEqual((await db.migrate(migrations)).ran, [1]);
  await Term.load();
  assert.equal(Term.count(), 2);
  assert.ok(Term.all().every((r) => r.id));
  assert.ok((await adapter.listTabs()).includes("_backup_1_terms"));

  assert.deepEqual((await db.migrate(migrations)).ran, []);
  assert.equal((await adapter.readAll("_migrations")).length, 2);
});

test("guard blocks migrate, and validation rejects bad input", async () => {
  const guarded = connect({ adapter: memoryAdapter(), guard: () => false });
  guarded.table("terms", columns);
  await assert.rejects(guarded.migrate(), ForbiddenError);

  const db = connect({ adapter: memoryAdapter() });
  const Term = db.table("terms", columns);
  await db.migrate();
  await Term.load();
  await assert.rejects(Term.insert({}), /required/);
  await assert.rejects(Term.insert({ term1: "x", id: "forced" }), /read-only/);
});

test("update leaves columns the schema does not know about untouched", async () => {
  const adapter = memoryAdapter();
  const db = connect({ adapter });
  const Term = db.table("terms", columns);
  await db.migrate();
  await Term.load();
  const rec = await Term.insert({ term1: "a" });

  await adapter.updateRows("terms", [
    { row: 1, col: 6, values: ["notes"] },
    { row: 2, col: 6, values: ["keep me"] },
  ]);
  await Term.load();
  await Term.update(rec.id, { term1: "b" });

  assert.equal((await adapter.readAll("terms"))[1][6], "keep me");
});
