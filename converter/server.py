"""Isolated MarkItDown converter: file bytes in, Markdown out."""

import io
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

from markitdown import MarkItDown, StreamInfo

PORT = int(os.environ.get("PORT", "8080"))
MAX_BYTES = int(os.environ.get("MAX_BYTES", str(10 * 1024 * 1024)))
MAX_OUTPUT_CHARS = int(os.environ.get("MAX_OUTPUT_CHARS", "500000"))
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".epub", ".html", ".htm"}

# Plugins off: only built-in converters run.
converter = MarkItDown(enable_plugins=False)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, {"status": "ok"})
        else:
            self.reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/convert":
            return self.reply(404, {"error": "not found"})

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            return self.reply(413, {"error": "empty or too large"})

        filename = unquote(self.headers.get("X-Filename", ""))
        extension = os.path.splitext(filename)[1].lower()
        if extension not in ALLOWED_EXTENSIONS:
            return self.reply(415, {"error": f"unsupported extension {extension}"})

        data = self.rfile.read(length)
        try:
            result = converter.convert_stream(io.BytesIO(data), stream_info=StreamInfo(extension=extension))
        except Exception as error:  # Any parser failure is a client error.
            return self.reply(422, {"error": f"conversion failed: {type(error).__name__}"})

        self.reply(200, {"markdown": (result.markdown or "")[:MAX_OUTPUT_CHARS]})

    def log_message(self, fmt, *args):
        print(f"[converter] {self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"[converter] listening on port {PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
