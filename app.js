import { connect, csvAdapter, sheetsAdapter } from "./lib/index.js";

const { CLIENT_ID, SPREADSHEET_ID, TAB, ADMIN_EMAIL } = window.CONFIG;
const SCOPE = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email";
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const FIELDS = ["Termo 1", "Termo 2"];

const $ = (id) => document.getElementById(id);
let tokenClient;
let accessToken = null;
let userEmail = null;

const getToken = () => {
  if (!accessToken) throw new Error("Not signed in yet.");
  return accessToken;
};

const isAdmin = () => LOCAL || userEmail === ADMIN_EMAIL;

const db = connect({
  adapter: LOCAL ? csvAdapter() : sheetsAdapter({ spreadsheetId: SPREADSHEET_ID, getToken }),
  guard: isAdmin,
});

const Term = db.table(TAB, {
  "Termo 1": { type: "string", required: true },
  "Termo 2": { type: "string" },
});

const migrations = [
  { id: 1, name: "backfill ids", up: (ctx) => ctx.backfill(TAB, "id", () => crypto.randomUUID()) },
];

function setStatus(message, isError = false) {
  const el = $("status");
  el.textContent = message;
  el.className = isError ? "error" : "";
}

function signedOut(message) {
  accessToken = null;
  userEmail = null;
  $("app").hidden = true;
  $("signin").hidden = false;
  setStatus(message, true);
}

async function run(task) {
  try {
    await task();
  } catch (err) {
    if (err.status === 401) signedOut("Token expired. Sign in again.");
    else setStatus(err.message, true);
  }
}

function button(label, action) {
  const el = document.createElement("button");
  el.textContent = label;
  el.dataset.action = action;
  return el;
}

function render() {
  const table = $("table");
  table.replaceChildren();
  const head = table.insertRow();
  for (const name of [...FIELDS, ""]) {
    const th = document.createElement("th");
    th.textContent = name;
    head.appendChild(th);
  }
  for (const rec of Term.all()) {
    const tr = table.insertRow();
    tr.dataset.id = rec.id;
    for (const field of FIELDS) tr.insertCell().textContent = rec[field] ?? "";
    tr.insertCell().append(button("Edit", "edit"), button("Delete", "delete"));
  }
}

function startEdit(tr) {
  const rec = Term.find(tr.dataset.id);
  FIELDS.forEach((field, i) => {
    const input = document.createElement("input");
    input.value = rec[field] ?? "";
    tr.cells[i].replaceChildren(input);
  });
  tr.cells[FIELDS.length].replaceChildren(button("Save", "save"), button("Cancel", "cancel"));
}

const saveEdit = (tr) =>
  run(async () => {
    const patch = Object.fromEntries(FIELDS.map((field, i) => [field, tr.cells[i].firstChild.value || null]));
    await Term.update(tr.dataset.id, patch);
    render();
    setStatus("Saved.");
  });

const removeRow = (tr) =>
  run(async () => {
    await Term.remove(tr.dataset.id);
    render();
    setStatus("Deleted.");
  });

async function start() {
  setStatus("Loading...");
  await run(async () => {
    const { ran } = isAdmin() ? await db.migrate(migrations) : { ran: [] };
    await Term.load();
    render();
    $("app").hidden = false;
    const where = LOCAL ? " from data/ (local mode)" : "";
    const migrated = ran.length ? `; ran migrations ${ran.join(", ")}` : "";
    setStatus(`Loaded ${Term.count()} rows${where}${migrated}.`);
  });
}

async function fetchEmail() {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = new Error(`Userinfo error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const info = await res.json();
  return info.email_verified ? info.email : null;
}

function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: async (response) => {
      if (response.error) {
        setStatus(`Sign-in failed: ${response.error}`, true);
        return;
      }
      accessToken = response.access_token;
      $("signin").hidden = true;
      await run(async () => {
        userEmail = await fetchEmail();
      });
      if (accessToken) await start();
    },
    error_callback: (err) => setStatus(`Sign-in failed: ${err.type}`, true),
  });
  $("signin").disabled = false;
}

$("signin").addEventListener("click", () => tokenClient.requestAccessToken());

$("table").addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  const tr = btn.closest("tr");
  const actions = {
    edit: () => startEdit(tr),
    cancel: render,
    save: () => saveEdit(tr),
    delete: () => removeRow(tr),
  };
  actions[btn.dataset.action]();
});

$("add-form").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    await Term.insert({ "Termo 1": $("term1").value, "Termo 2": $("term2").value || null });
    $("add-form").reset();
    render();
    setStatus("Added.");
  });
});

if (LOCAL) {
  $("signin").hidden = true;
  start();
} else if (window.google?.accounts?.oauth2) {
  initAuth();
} else {
  window.addEventListener("gis-ready", initAuth, { once: true });
}
