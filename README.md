# Sheet demo

Static page that reads, adds, edits and deletes rows in a private Google Sheet from the browser, using Google Identity Services (client-side OAuth) and the small `lib/` ORM (see [lib/README.md](lib/README.md)). No backend, no secrets.

## Why a public repo is safe

- The repo only holds the OAuth **client ID**, the **spreadsheet ID** and the admin email. None is a secret.
- Access is decided by Google at sign-in: the token belongs to whoever signs in, and the sheet's own sharing settings decide what that token can touch.
- While the OAuth consent screen is in **Testing** mode, only the test users you list can sign in at all.
- The admin email check in [config.js](config.js) only gates schema migrations. It is a guard against accidents, not security.

## One-time Google Cloud setup (manual)

1. Create a project at https://console.cloud.google.com/.
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **Google Auth Platform → Audience**: user type **External**, publishing status **Testing**. Add your own Google account under **Test users**.
4. **Google Auth Platform → Data access**: add the scope `https://www.googleapis.com/auth/spreadsheets`. The app also asks for `userinfo.email` to identify the admin.
5. **Clients → Create client** → type **Web application**, with **Authorized JavaScript origins** `https://<your-user>.github.io` (origin only, no path). Leave redirect URIs empty.
6. Copy the client ID, the spreadsheet ID (the long string in `docs.google.com/spreadsheets/d/<ID>/edit`), the tab name and the admin email into `config.js`.

Do not share the sheet with anyone or anything. You sign in as its owner, so the token already has access.

## Run locally (CSV mode, no Google)

```bash
python3 server.py
```

Open http://localhost:8000. On `localhost` the page skips Google sign-in and stores each tab as `data/<tab>.csv` through `server.py`. The `data/` folder is git-ignored. Migrations run automatically on load.

On any other host (GitHub Pages) the page uses the Google Sheet and asks you to sign in. Click through the "unverified app" warning (Advanced → continue). When the admin signs in, pending migrations run automatically.

## Migrations

[app.js](app.js) defines the schema and the migration list. Migration 1 adds an `id` to the rows that existed before the library, and the library then adds the `createdAt`, `updatedAt` and `deletedAt` columns. Migrations write a backup tab `_backup_<id>_<tab>` first. Delete those tabs once you are happy with the result.

## Host on GitHub Pages

Repo **Settings → Pages → Source → GitHub Actions**. The workflow in `.github/workflows/pages.yml` deploys on every push to `main`.

## Giving someone else access

1. Share the sheet with their Google account (Editor to let them change rows).
2. Add their account as a **Test user** on the consent screen (limit 100).

They can use the app, but only the admin email can run migrations.
