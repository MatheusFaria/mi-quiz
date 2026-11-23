import csv
import json
import os
import re
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
TAB_NAME = re.compile(r"^\w[\w .-]*$")
LOCK = threading.Lock()


class ApiError(Exception):
    def __init__(self, status, message, **extra):
        super().__init__(message)
        self.status = status
        self.payload = {"error": message, **extra}


def tab_path(tab):
    if not isinstance(tab, str) or not TAB_NAME.match(tab):
        raise ApiError(400, "invalid tab name")
    return os.path.join(DATA_DIR, tab + ".csv")


def missing_tab(tab):
    return ApiError(404, f"tab not found: {tab}", code="TAB_NOT_FOUND", tab=tab)


def read_rows(tab):
    path = tab_path(tab)
    if not os.path.exists(path):
        raise missing_tab(tab)
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.reader(f))


def write_rows(tab, rows):
    with open(tab_path(tab), "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)


def cell(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def list_tabs(query, body):
    return {"tabs": sorted(f[:-4] for f in os.listdir(DATA_DIR) if f.endswith(".csv"))}


def read_tab(query, body):
    return {"rows": read_rows(query.get("tab", [None])[0])}


def append_rows(query, body):
    rows = read_rows(body.get("tab"))
    first = len(rows) + 1
    rows.extend([cell(v) for v in row] for row in body["rows"])
    write_rows(body["tab"], rows)
    return {"row": first}


def update_rows(query, body):
    rows = read_rows(body.get("tab"))
    for update in body["updates"]:
        number, col, values = update["row"], update.get("col", 0), update["values"]
        while len(rows) < number:
            rows.append([])
        row = rows[number - 1]
        while len(row) < col + len(values):
            row.append("")
        for i, value in enumerate(values):
            row[col + i] = cell(value)
    write_rows(body["tab"], rows)
    return {"ok": True}


def create_tab(query, body):
    if os.path.exists(tab_path(body.get("tab"))):
        raise ApiError(409, "tab already exists")
    write_rows(body["tab"], [[cell(v) for v in body["header"]]])
    return {"ok": True}


def duplicate_tab(query, body):
    source, target = tab_path(body.get("from")), tab_path(body.get("to"))
    if not os.path.exists(source):
        raise missing_tab(body["from"])
    if os.path.exists(target):
        raise ApiError(409, "tab already exists")
    shutil.copyfile(source, target)
    return {"ok": True}


ROUTES = {
    ("GET", "/api/tabs"): list_tabs,
    ("GET", "/api/read"): read_tab,
    ("POST", "/api/append"): append_rows,
    ("POST", "/api/update"): update_rows,
    ("POST", "/api/create"): create_tab,
    ("POST", "/api/duplicate"): duplicate_tab,
}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/"):
            self.handle_api("GET")
        else:
            super().do_GET()

    def do_POST(self):
        self.handle_api("POST")

    def handle_api(self, method):
        url = urlparse(self.path)
        try:
            route = ROUTES.get((method, url.path))
            if route is None:
                raise ApiError(404, "unknown endpoint")
            body = {}
            if method == "POST":
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
            with LOCK:
                result = route(parse_qs(url.query), body)
            self.send_json(200, result)
        except ApiError as error:
            self.send_json(error.status, error.payload)
        except (KeyError, TypeError, ValueError) as error:
            self.send_json(400, {"error": f"bad request: {error}"})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    os.chdir(ROOT)
    os.makedirs(DATA_DIR, exist_ok=True)
    print("Serving on http://localhost:8000 (CSV mode, data in ./data)")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
