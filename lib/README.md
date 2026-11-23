# sheet-orm

A small ORM-like library that uses Google Sheet tabs as tables. Plain ES modules, no build step, no dependencies. Runs in the browser and in Node 20+.

```js
import { connect, sheetsAdapter } from "./lib/index.js";

const db = connect({
  adapter: sheetsAdapter({ spreadsheetId, getToken }),
  guard: () => isAdmin(),
});

const Term = db.table("Sheet1", {
  term1: { type: "string", required: true },
  term2: { type: "string" },
});

await db.migrate(migrations);
await Term.load();

Term.all();
Term.find(id);
Term.where((t) => t.term1.startsWith("a"));
await Term.insert({ term1: "a" });
await Term.update(id, { term2: "b" });
await Term.remove(id);
await Term.restore(id);
```

## Concepts

- **Table**: one tab. The header row maps columns by name, so column order in the sheet does not matter. Columns the schema does not know about are preserved on update.
- **Auto columns**: `id` (UUID) always, `createdAt` and `updatedAt` (`timestamps`, default on), `deletedAt` (`softDelete`, default on).
- **Types**: `string`, `number`, `boolean`, `date` (ISO text), `json`. Writes use `RAW`, so Sheets never reinterprets input as a date or formula.
- **Reads** load the whole tab into memory. Queries are plain JavaScript over arrays.
- **Writes** go to the adapter first and update memory only on success. The library assumes a single writer.
- `remove()` sets `deletedAt`. Hard delete is not implemented.

## Migrations

`db.migrate(migrations)` does, in order:

1. Checks the `guard` (throws `ForbiddenError` if it returns falsy).
2. Creates the `_migrations` tab if missing, then runs pending migrations by ascending `id` and records each.
3. For every defined table, creates the tab or appends missing columns (additive changes are automatic).

A migration is `{ id, name, up(ctx) }`. `ctx` offers `addColumn`, `renameColumn` and `backfill(tab, column, make)`. All three are idempotent and are no-ops when the tab does not exist yet. The first change a migration makes to a tab copies it to `_backup_<id>_<tab>`; delete those tabs by hand when you no longer need them.

Tabs starting with `_` are reserved for the library.

## Adapters

An adapter is an object with `listTabs`, `readAll(tab)`, `append(tab, rows)` (returns the first row number), `updateRows(tab, [{ row, col?, values }])`, `createTab(tab, header)` and `duplicateTab(from, to)`. Row numbers are 1-based and include the header.

- `sheetsAdapter({ spreadsheetId, getToken })`: Google Sheets REST API. `getToken` returns an OAuth access token.
- `csvAdapter({ baseUrl })`: talks to `server.py`, which stores each tab as `data/<tab>.csv`.
- `memoryAdapter(initial)`: in-memory, for tests.

## Tests

```bash
cd lib && node --test
```
