import { ApiError, TabNotFoundError } from "../errors.js";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

const quote = (tab) => `'${tab.replaceAll("'", "''")}'`;

function colLetter(index) {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

export function sheetsAdapter({ spreadsheetId, getToken, fetch: fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const base = `${API}/${spreadsheetId}`;

  async function call(path, { method = "GET", body } = {}) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(`Sheets API ${res.status}: ${data.error?.message ?? "unknown error"}`, res.status);
    return data;
  }

  async function sheetIds() {
    const data = await call("?fields=sheets.properties(sheetId,title)");
    return new Map(data.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  }

  const valuesPath = (tab) => `/values/${encodeURIComponent(quote(tab))}`;

  async function updateRows(tab, updates) {
    await call("/values:batchUpdate", {
      method: "POST",
      body: {
        valueInputOption: "RAW",
        data: updates.map(({ row, col = 0, values }) => ({
          range: `${quote(tab)}!${colLetter(col)}${row}`,
          values: [values],
        })),
      },
    });
  }

  return {
    async listTabs() {
      return [...(await sheetIds()).keys()];
    },

    async readAll(tab) {
      try {
        const data = await call(`${valuesPath(tab)}?valueRenderOption=UNFORMATTED_VALUE`);
        return data.values ?? [];
      } catch (err) {
        if (err.status === 400 && /Unable to parse range/.test(err.message)) throw new TabNotFoundError(tab);
        throw err;
      }
    },

    async append(tab, rows) {
      const data = await call(`${valuesPath(tab)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        body: { values: rows },
      });
      const range = data.updates.updatedRange;
      return Number(range.slice(range.lastIndexOf("!") + 1).match(/^[A-Z]+(\d+)/)[1]);
    },

    updateRows,

    async createTab(tab, header) {
      await call(":batchUpdate", { method: "POST", body: { requests: [{ addSheet: { properties: { title: tab } } }] } });
      await updateRows(tab, [{ row: 1, values: header }]);
    },

    async duplicateTab(from, to) {
      const sourceSheetId = (await sheetIds()).get(from);
      if (sourceSheetId === undefined) throw new TabNotFoundError(from);
      await call(":batchUpdate", {
        method: "POST",
        body: { requests: [{ duplicateSheet: { sourceSheetId, newSheetName: to } }] },
      });
    },
  };
}
