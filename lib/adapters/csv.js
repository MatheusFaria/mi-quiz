import { ApiError, TabNotFoundError } from "../errors.js";

export function csvAdapter({ baseUrl = "" } = {}) {
  async function call(path, body) {
    const init = body === undefined
      ? undefined
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(`${baseUrl}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 && data.code === "TAB_NOT_FOUND") throw new TabNotFoundError(data.tab);
    if (!res.ok) throw new ApiError(`CSV server ${res.status}: ${data.error ?? "unknown error"}`, res.status);
    return data;
  }

  return {
    async listTabs() {
      return (await call("/api/tabs")).tabs;
    },
    async readAll(tab) {
      return (await call(`/api/read?tab=${encodeURIComponent(tab)}`)).rows;
    },
    async append(tab, rows) {
      return (await call("/api/append", { tab, rows })).row;
    },
    async updateRows(tab, updates) {
      await call("/api/update", { tab, updates });
    },
    async createTab(tab, header) {
      await call("/api/create", { tab, header });
    },
    async duplicateTab(from, to) {
      await call("/api/duplicate", { from, to });
    },
  };
}
