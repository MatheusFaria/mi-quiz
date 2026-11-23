const { CLIENT_ID, SPREADSHEET_ID, RANGE } = window.CONFIG;
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(RANGE)}`;
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);

const $ = (id) => document.getElementById(id);
let tokenClient;
let accessToken = null;

function setStatus(message, isError = false) {
  const el = $("status");
  el.textContent = message;
  el.className = isError ? "error" : "";
}

function signedOut(message) {
  accessToken = null;
  $("app").hidden = true;
  $("signin").hidden = false;
  setStatus(message, true);
}

async function api(url, options = {}) {
  if (!accessToken) throw new Error("Not signed in yet.");
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 401) {
    signedOut("Token expired. Sign in again.");
    const err = new Error("Token expired.");
    err.handled = true;
    throw err;
  }
  const body = await res.json();
  if (!res.ok) throw new Error(`API error ${res.status}: ${body.error?.message ?? "unknown"}`);
  return body;
}

const sheetsBackend = {
  async list() {
    return (await api(BASE)).values ?? [];
  },
  append(row) {
    return api(`${BASE}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: [row] }),
    });
  },
};

const csvBackend = {
  async list() {
    const res = await fetch("/api/rows");
    if (!res.ok) throw new Error(`CSV server error ${res.status}`);
    return res.json();
  },
  async append(row) {
    const res = await fetch("/api/rows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    });
    if (!res.ok) throw new Error(`CSV server error ${res.status}`);
  },
};

const backend = LOCAL ? csvBackend : sheetsBackend;

function render(values) {
  const table = $("table");
  table.replaceChildren();
  values.forEach((row, i) => {
    const tr = table.insertRow();
    row.forEach((cell) => {
      const td = document.createElement(i === 0 ? "th" : "td");
      td.textContent = cell;
      tr.appendChild(td);
    });
  });
}

async function load() {
  setStatus("Loading...");
  try {
    const values = await backend.list();
    render(values);
    $("app").hidden = false;
    setStatus(`Loaded ${values.length} rows${LOCAL ? " from data.csv (local mode)" : ""}.`);
  } catch (err) {
    if (!err.handled) setStatus(err.message, true);
  }
}

async function addRow(event) {
  event.preventDefault();
  setStatus("Saving...");
  try {
    await backend.append([$("term1").value, $("term2").value]);
    $("add-form").reset();
    await load();
  } catch (err) {
    if (!err.handled) setStatus(err.message, true);
  }
}

function initAuth() {
  if (LOCAL) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      if (response.error) {
        setStatus(`Sign-in failed: ${response.error}`, true);
        return;
      }
      accessToken = response.access_token;
      $("signin").hidden = true;
      load();
    },
    error_callback: (err) => setStatus(`Sign-in failed: ${err.type}`, true),
  });
  $("signin").disabled = false;
}

$("signin").addEventListener("click", () => tokenClient.requestAccessToken());
$("add-form").addEventListener("submit", addRow);

if (LOCAL) {
  $("signin").hidden = true;
  load();
}
