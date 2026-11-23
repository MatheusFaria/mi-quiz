const { CLIENT_ID, SPREADSHEET_ID, RANGE } = window.CONFIG;
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(RANGE)}`;

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
    throw new Error("Token expired.");
  }
  const body = await res.json();
  if (!res.ok) throw new Error(`API error ${res.status}: ${body.error?.message ?? "unknown"}`);
  return body;
}

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
    const data = await api(BASE);
    render(data.values ?? []);
    $("app").hidden = false;
    setStatus(`Loaded ${(data.values ?? []).length} rows.`);
  } catch (err) {
    if (accessToken) setStatus(err.message, true);
  }
}

async function addRow(event) {
  event.preventDefault();
  const row = [$("term1").value, $("term2").value];
  setStatus("Saving...");
  try {
    await api(`${BASE}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: [row] }),
    });
    $("add-form").reset();
    await load();
  } catch (err) {
    if (accessToken) setStatus(err.message, true);
  }
}

function initAuth() {
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
