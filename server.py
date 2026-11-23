import csv
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(ROOT, "data.csv")
HEADER = ["Termo 1", "Termo 2"]


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/rows":
            with open(CSV_PATH, newline="", encoding="utf-8") as f:
                self.send_json(list(csv.reader(f)))
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != "/api/rows":
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers["Content-Length"]))
        row = json.loads(body)["values"][0]
        with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(row)
        self.send_json({"ok": True})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, data):
        payload = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    os.chdir(ROOT)
    if not os.path.exists(CSV_PATH):
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(HEADER)
    print("Serving on http://localhost:8000 (CSV mode)")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
