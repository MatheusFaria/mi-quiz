# Sheet demo

Static page that reads and appends rows to a private Google Sheet from the browser, using Google Identity Services (client-side OAuth). No backend, no secrets.

## Why a public repo is safe

- The repo only holds the OAuth **client ID** and the **spreadsheet ID**. Neither is a secret.
- Access is decided by Google at sign-in: the token belongs to whoever signs in, and the sheet's own sharing settings decide what that token can touch.
- While the OAuth consent screen is in **Testing** mode, only the test users you list can sign in at all.

## One-time Google Cloud setup (manual)

1. Create a project at https://console.cloud.google.com/.
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **APIs & Services → OAuth consent screen**:
   - User type **External**, publishing status **Testing** (do not publish).
   - Add your own Google account under **Test users**.
   - Add the scope `https://www.googleapis.com/auth/spreadsheets`.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**:
   - **Authorized JavaScript origins**: `http://localhost:8000` and, for hosting, `https://<your-user>.github.io` (origin only, no path).
   - Leave redirect URIs empty.
5. Copy the client ID into `config.js`.
6. Copy the spreadsheet ID (the long string in `docs.google.com/spreadsheets/d/<ID>/edit`) into `config.js`. Set `RANGE` to your tab name, e.g. `Sheet1!A:B`.

Do not share the sheet with anyone or anything. You sign in as its owner, so the token already has access.

## Run locally (CSV mode, no Google)

```bash
python3 server.py
```

Open http://localhost:8000. On `localhost` the page skips Google sign-in and reads and writes `data.csv` through `server.py`. The file is created on first run and is git-ignored.

On any other host (GitHub Pages) the page uses the Google Sheet and asks you to sign in. Click through the "unverified app" warning (Advanced → continue).

## Host on GitHub Pages

Repo **Settings → Pages → Deploy from branch → main / root**. Then add the Pages origin to the OAuth client's authorized JavaScript origins.

## Giving someone else access

1. Share the sheet with their Google account (Editor to let them add rows).
2. Add their account as a **Test user** on the consent screen (limit 100).
