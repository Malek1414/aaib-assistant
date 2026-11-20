"""Searchify bridge: raw archived HTML in, clean main text out. No network.

Reads JSON lines {"id", "url", "html"} on stdin and writes JSON lines
{"id", "title", "content"} on stdout, using only Searchify's local reader
(`searchify.extract.reader.reader_document`, trafilatura + resiliparse).

The HTML always comes from the ingestion cache of Internet Archive captures;
this process never fetches anything. As a hard guarantee every socket is
disabled before Searchify is imported, so no search backend, cloud fallback
or browser stage could reach the network even by accident.
"""
from __future__ import annotations

import json
import socket
import sys


class _NoNetwork(socket.socket):
    def __init__(self, *a, **k):  # noqa: D401
        raise RuntimeError("network disabled in the Searchify bridge")


def _deny(*_a, **_k):
    raise RuntimeError("network disabled in the Searchify bridge")


socket.socket = _NoNetwork  # type: ignore[misc]
socket.create_connection = _deny  # type: ignore[assignment]
socket.getaddrinfo = _deny  # type: ignore[assignment]

from searchify.extract.reader import reader_document  # noqa: E402


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        try:
            doc = reader_document(req["html"], req.get("url", ""), fmt="markdown")
            out = {"id": req["id"], "title": doc.get("title"), "content": doc.get("content") or ""}
        except Exception as exc:  # noqa: BLE001 - report, never crash the batch
            out = {"id": req["id"], "title": None, "content": "", "error": repr(exc)}
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
