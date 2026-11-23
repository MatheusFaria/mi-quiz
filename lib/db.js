import { ForbiddenError, SchemaError } from "./errors.js";
import { runMigrations, syncTable } from "./migrate.js";
import { Table } from "./table.js";

class Db {
  #adapter;
  #guard;
  #tables = new Map();

  constructor(adapter, guard) {
    if (!adapter) throw new TypeError("adapter is required");
    this.#adapter = adapter;
    this.#guard = guard;
  }

  table(name, columns, options) {
    if (name.startsWith("_")) throw new SchemaError(`Tab names starting with "_" are reserved: "${name}"`);
    if (this.#tables.has(name)) throw new SchemaError(`Table "${name}" is already defined`);
    const table = new Table(this.#adapter, name, columns, options);
    this.#tables.set(name, table);
    return table;
  }

  async migrate(migrations = []) {
    if (this.#guard && !(await this.#guard())) throw new ForbiddenError("migrate() was refused by the guard");
    const ran = await runMigrations(this.#adapter, migrations);
    for (const table of this.#tables.values()) {
      await syncTable(this.#adapter, table.name, Object.keys(table.columns));
    }
    return { ran };
  }
}

export function connect({ adapter, guard } = {}) {
  return new Db(adapter, guard);
}
