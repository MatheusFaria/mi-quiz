import { NotFoundError, NotSupportedError, SchemaError, ValidationError } from "./errors.js";
import { checkType, isEmpty, readCell, writeCell } from "./types.js";

const AUTO_COLUMNS = ["id", "createdAt", "updatedAt", "deletedAt"];

function buildColumns(userColumns, { softDelete, timestamps }) {
  for (const [name, def] of Object.entries(userColumns)) {
    if (AUTO_COLUMNS.includes(name)) throw new SchemaError(`Column name "${name}" is reserved`);
    checkType(def.type);
  }
  const columns = { id: { type: "string" }, ...userColumns };
  if (timestamps) {
    columns.createdAt = { type: "date" };
    columns.updatedAt = { type: "date" };
  }
  if (softDelete) columns.deletedAt = { type: "date" };
  return columns;
}

export class Table {
  #adapter;
  #header = null;
  #records = new Map();

  constructor(adapter, name, userColumns, { softDelete = true, timestamps = true } = {}) {
    this.#adapter = adapter;
    this.name = name;
    this.userColumns = userColumns;
    this.softDelete = softDelete;
    this.timestamps = timestamps;
    this.columns = buildColumns(userColumns, { softDelete, timestamps });
  }

  async load() {
    const grid = await this.#adapter.readAll(this.name);
    if (!grid.length) throw new SchemaError(`Tab "${this.name}" is empty; run db.migrate()`);
    const header = grid[0].map(String);
    const names = Object.keys(this.columns);
    const missing = names.filter((c) => !header.includes(c));
    if (missing.length) {
      throw new SchemaError(`Tab "${this.name}" is missing columns ${missing.join(", ")}; run db.migrate()`);
    }
    const position = Object.fromEntries(names.map((c) => [c, header.indexOf(c)]));
    const records = new Map();
    for (let i = 1; i < grid.length; i++) {
      const raw = grid[i];
      if (raw.every(isEmpty)) continue;
      const rec = {};
      for (const [col, def] of Object.entries(this.columns)) rec[col] = readCell(def.type, raw[position[col]]);
      if (!rec.id) throw new SchemaError(`Row ${i + 1} of "${this.name}" has no id; run a backfill migration`);
      if (records.has(rec.id)) throw new SchemaError(`Duplicate id ${rec.id} in "${this.name}"`);
      records.set(rec.id, { rec, row: i + 1, raw });
    }
    this.#header = header;
    this.#records = records;
    return this;
  }

  refresh() {
    return this.load();
  }

  all({ includeDeleted = false } = {}) {
    const out = [];
    for (const { rec } of this.#records.values()) {
      if (this.#isDeleted(rec) && !includeDeleted) continue;
      out.push({ ...rec });
    }
    return out;
  }

  find(id) {
    const entry = this.#records.get(id);
    return entry && !this.#isDeleted(entry.rec) ? { ...entry.rec } : undefined;
  }

  where(predicate) {
    return this.all().filter(predicate);
  }

  count() {
    return this.all().length;
  }

  async insert(data) {
    this.#requireLoaded();
    this.#validate(data, { partial: false });
    const now = new Date().toISOString();
    const rec = {};
    for (const col of Object.keys(this.columns)) rec[col] = data[col] ?? null;
    rec.id = globalThis.crypto.randomUUID();
    if (this.timestamps) {
      rec.createdAt = now;
      rec.updatedAt = now;
    }
    const raw = this.#serialize(rec, []);
    const row = await this.#adapter.append(this.name, [raw]);
    this.#records.set(rec.id, { rec, row, raw });
    return { ...rec };
  }

  async update(id, patch) {
    const entry = this.#entry(id);
    if (this.#isDeleted(entry.rec)) throw new NotFoundError(`Record ${id} is deleted; restore it first`);
    this.#validate(patch, { partial: true });
    const next = { ...entry.rec };
    for (const key of Object.keys(patch)) next[key] = patch[key] ?? null;
    return this.#commit(entry, this.#touch(next));
  }

  async remove(id) {
    this.#requireSoftDelete();
    const entry = this.#entry(id);
    if (entry.rec.deletedAt) return;
    await this.#commit(entry, this.#touch({ ...entry.rec, deletedAt: new Date().toISOString() }));
  }

  async restore(id) {
    this.#requireSoftDelete();
    const entry = this.#entry(id);
    if (!entry.rec.deletedAt) return;
    await this.#commit(entry, this.#touch({ ...entry.rec, deletedAt: null }));
  }

  #isDeleted(rec) {
    return this.softDelete && Boolean(rec.deletedAt);
  }

  #requireLoaded() {
    if (!this.#header) throw new SchemaError(`Call load() on "${this.name}" first`);
  }

  #requireSoftDelete() {
    if (!this.softDelete) throw new NotSupportedError("Hard delete is not implemented; enable softDelete");
  }

  #entry(id) {
    this.#requireLoaded();
    const entry = this.#records.get(id);
    if (!entry) throw new NotFoundError(`No record ${id} in "${this.name}"`);
    return entry;
  }

  #touch(rec) {
    if (this.timestamps) rec.updatedAt = new Date().toISOString();
    return rec;
  }

  #validate(data, { partial }) {
    for (const key of Object.keys(data)) {
      if (!Object.hasOwn(this.userColumns, key)) throw new ValidationError(`Unknown or read-only field "${key}"`);
    }
    for (const [name, def] of Object.entries(this.userColumns)) {
      if (partial && !Object.hasOwn(data, name)) continue;
      if (def.required && isEmpty(data[name])) throw new ValidationError(`Field "${name}" is required`);
      writeCell(def.type, data[name]);
    }
  }

  #serialize(rec, baseRaw) {
    return this.#header.map((h, i) =>
      Object.hasOwn(this.columns, h) ? writeCell(this.columns[h].type, rec[h]) : (baseRaw[i] ?? ""),
    );
  }

  async #commit(entry, next) {
    const raw = this.#serialize(next, entry.raw);
    await this.#adapter.updateRows(this.name, [{ row: entry.row, values: raw }]);
    entry.rec = next;
    entry.raw = raw;
    return { ...next };
  }
}
