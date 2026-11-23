import { TabNotFoundError } from "../errors.js";

export function memoryAdapter(initial = {}) {
  const tabs = new Map(Object.entries(initial).map(([name, rows]) => [name, rows.map((r) => [...r])]));

  const get = (tab) => {
    if (!tabs.has(tab)) throw new TabNotFoundError(tab);
    return tabs.get(tab);
  };

  return {
    async listTabs() {
      return [...tabs.keys()];
    },

    async readAll(tab) {
      return get(tab).map((r) => [...r]);
    },

    async append(tab, rows) {
      const grid = get(tab);
      const first = grid.length + 1;
      for (const row of rows) grid.push([...row]);
      return first;
    },

    async updateRows(tab, updates) {
      const grid = get(tab);
      for (const { row, col = 0, values } of updates) {
        while (grid.length < row) grid.push([]);
        const target = grid[row - 1];
        while (target.length < col) target.push("");
        values.forEach((v, i) => {
          target[col + i] = v;
        });
      }
    },

    async createTab(tab, header) {
      if (tabs.has(tab)) throw new Error(`Tab "${tab}" already exists`);
      tabs.set(tab, [[...header]]);
    },

    async duplicateTab(from, to) {
      if (tabs.has(to)) throw new Error(`Tab "${to}" already exists`);
      tabs.set(to, get(from).map((r) => [...r]));
    },
  };
}
