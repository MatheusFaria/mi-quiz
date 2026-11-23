import { SchemaError } from "./errors.js";
import { isEmpty } from "./types.js";

export const MIGRATIONS_TAB = "_migrations";
const MIGRATIONS_HEADER = ["id", "name", "appliedAt"];

async function hasTab(adapter, tab) {
  return (await adapter.listTabs()).includes(tab);
}

async function readHeader(adapter, tab) {
  if (!(await hasTab(adapter, tab))) return null;
  const grid = await adapter.readAll(tab);
  return (grid[0] ?? []).map(String);
}

export async function syncTable(adapter, tab, wanted) {
  const header = await readHeader(adapter, tab);
  if (!header) {
    await adapter.createTab(tab, wanted);
    return;
  }
  const missing = wanted.filter((c) => !header.includes(c));
  if (missing.length) await adapter.updateRows(tab, [{ row: 1, values: [...header, ...missing] }]);
}

function makeContext(adapter, migrationId) {
  const backedUp = new Set();

  async function backup(tab) {
    if (backedUp.has(tab)) return;
    backedUp.add(tab);
    const name = `_backup_${migrationId}_${tab}`;
    if (!(await hasTab(adapter, name))) await adapter.duplicateTab(tab, name);
  }

  async function addColumn(tab, column) {
    const header = await readHeader(adapter, tab);
    if (!header || header.includes(column)) return;
    await backup(tab);
    await adapter.updateRows(tab, [{ row: 1, values: [...header, column] }]);
  }

  async function renameColumn(tab, from, to) {
    const header = await readHeader(adapter, tab);
    if (!header) return;
    const col = header.indexOf(from);
    if (col < 0) {
      if (header.includes(to)) return;
      throw new SchemaError(`Column "${from}" not found in "${tab}"`);
    }
    await backup(tab);
    await adapter.updateRows(tab, [{ row: 1, col, values: [to] }]);
  }

  async function backfill(tab, column, make) {
    await addColumn(tab, column);
    if (!(await hasTab(adapter, tab))) return;
    const grid = await adapter.readAll(tab);
    const header = grid[0].map(String);
    const col = header.indexOf(column);
    const updates = [];
    for (let i = 1; i < grid.length; i++) {
      const row = grid[i];
      if (row.every(isEmpty) || !isEmpty(row[col])) continue;
      const record = Object.fromEntries(header.map((h, c) => [h, row[c] ?? null]));
      updates.push({ row: i + 1, col, values: [make(record)] });
    }
    if (!updates.length) return;
    await backup(tab);
    await adapter.updateRows(tab, updates);
  }

  return { addColumn, renameColumn, backfill };
}

export async function runMigrations(adapter, migrations) {
  const ids = migrations.map((m) => m.id);
  if (ids.some((id) => !Number.isInteger(id)) || new Set(ids).size !== ids.length) {
    throw new SchemaError("Migration ids must be unique integers");
  }
  if (!(await hasTab(adapter, MIGRATIONS_TAB))) await adapter.createTab(MIGRATIONS_TAB, MIGRATIONS_HEADER);
  const grid = await adapter.readAll(MIGRATIONS_TAB);
  const applied = new Set(grid.slice(1).map((r) => Number(r[0])));
  const ran = [];
  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (applied.has(migration.id)) continue;
    await migration.up(makeContext(adapter, migration.id));
    await adapter.append(MIGRATIONS_TAB, [[migration.id, migration.name ?? "", new Date().toISOString()]]);
    ran.push(migration.id);
  }
  return ran;
}
