#!/usr/bin/env python3
import argparse
import json
import queue
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import serial
except ImportError:
    print("Module Python 'serial' introuvable. Lance ce script avec le Python de PlatformIO.", file=sys.stderr)
    sys.exit(1)


HTML = r"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Liste Frigo - miroir e-paper</title>
  <style>
    :root { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #111; background: #d8d8d2; }
    body { margin: 0; min-height: 100vh; display: grid; grid-template-columns: minmax(560px, auto) 360px; gap: 24px; place-content: center; padding: 24px; box-sizing: border-box; }
    canvas { width: 540px; height: 960px; background: #f7f6ef; border: 6px solid #111; box-sizing: border-box; image-rendering: pixelated; }
    .side { align-self: stretch; max-height: 960px; display: flex; flex-direction: column; gap: 14px; }
    .status { border: 3px solid #111; padding: 12px; background: #f7f6ef; font-size: 14px; }
    .logs { flex: 1; overflow: auto; border: 3px solid #111; background: #f7f6ef; padding: 10px; font-size: 12px; white-space: pre-wrap; }
    @media (max-width: 980px) { body { grid-template-columns: 1fr; place-items: center; } .side { width: 540px; max-height: 360px; } }
  </style>
</head>
<body>
  <canvas id="screen" width="540" height="960"></canvas>
  <aside class="side">
    <div id="status" class="status">En attente du firmware...</div>
    <div id="logs" class="logs"></div>
  </aside>
  <script>
    const canvas = document.getElementById("screen");
    const ctx = canvas.getContext("2d");
    const logs = document.getElementById("logs");
    const BLACK = "#111";
    const WHITE = "#f7f6ef";
    const DARK = "#555";
    const labels = ["Listes", "Creche", "Tenues", "Velib", "Transp"];
    function fill(x, y, w, h, color = BLACK) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
    function rect(x, y, w, h, stroke = 3, color = BLACK) {
      fill(x, y, w, stroke, color); fill(x, y + h - stroke, w, stroke, color);
      fill(x, y, stroke, h, color); fill(x + w - stroke, y, stroke, h, color);
    }
    function text(x, y, value, size, color = BLACK, weight = "700") {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textBaseline = "top";
      ctx.fillText(String(value), x, y);
    }
    function centered(y, value, size, color = BLACK) {
      ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      ctx.fillText(value, (540 - ctx.measureText(value).width) / 2, y);
    }
    function arrowButton(x, y, up) {
      rect(x, y, 44, 56, 4);
      fill(x + 20, y + 14, 4, 28);
      if (up) {
        fill(x + 14, y + 20, 16, 4);
        fill(x + 17, y + 14, 10, 4);
      } else {
        fill(x + 14, y + 36, 16, 4);
        fill(x + 17, y + 42, 10, 4);
      }
    }
    function checkmark(x, y, color) {
      for (let i = 0; i < 8; i++) fill(x + i * 2, y + 10 + i, 3, 3, color);
      for (let i = 0; i < 14; i++) fill(x + 15 + i * 2, y + 18 - i, 3, 3, color);
    }
    function drawItem(y, item) {
      rect(62, y + 7, 34, 34, 4);
      if (item.checked) {
        fill(68, y + 13, 22, 22);
        checkmark(71, y + 16, WHITE);
      }
      text(128, y + 1, (item.label || "").slice(0, 12), 47, item.checked ? DARK : BLACK);
      fill(62, y + 52, 378, 2);
    }
    function drawNav(active) {
      fill(32, 850, 476, 4);
      fill(32, 854, 476, 78, WHITE);
      labels.forEach((label, index) => {
        const x = index * 108;
        const selected = label === active;
        if (selected) fill(x + 7, 858, 94, 66);
        text(x + 22, 908, label, 16, selected ? WHITE : BLACK);
      });
      fill(32, 932, 476, 6);
    }
    function render(state) {
      const visibleRows = state.visibleRows || 6;
      const items = state.items || [];
      const offset = state.scrollOffset || 0;
      const shown = items.slice(offset, offset + visibleRows);
      const remaining = items.filter(item => !item.checked).length;
      const maxOffset = Math.max(0, items.length - visibleRows);
      fill(0, 0, 540, 960, WHITE);
      rect(32, 0, 476, 760, 6);
      fill(32, 150, 476, 4);
      text(62, 42, (state.listName || "Courses").slice(0, 8), 68);
      if (items.length > visibleRows && offset > 0) arrowButton(376, 52, true);
      if (items.length > visibleRows && offset < maxOffset) arrowButton(438, 52, false);
      text(62, 172, remaining, 56);
      text(96, 194, "articles a acheter", 24);
      if (items.length > visibleRows) text(412, 194, `${offset + 1}-${Math.min(offset + visibleRows, items.length)}/${items.length}`, 24, DARK);
      shown.forEach((item, index) => drawItem(220 + index * 62, item));
      fill(32, 632, 476, 4);
      fill(62, 654, 416, 54);
      centered(672, "ECRIRE", 22, WHITE);
      rect(62, 724, 202, 46, 3);
      rect(276, 724, 202, 46, 3);
      centered(738, "CLAVIER", 22);
      text(342, 738, "EFFACER", 22);
      centered(800, "SYNCHRONISE", 24);
      drawNav(state.tab || "Listes");
      document.getElementById("status").textContent = `Dernier etat: ${state.reason || "?"} | ${new Date().toLocaleTimeString()} | offset ${offset}`;
    }
    const events = new EventSource("/events");
    events.addEventListener("preview", event => render(JSON.parse(event.data)));
    events.addEventListener("log", event => {
      logs.textContent += JSON.parse(event.data) + "\n";
      logs.scrollTop = logs.scrollHeight;
    });
    events.onerror = () => document.getElementById("status").textContent = "Connexion au moniteur interrompue";
  </script>
</body>
</html>
"""


class Hub:
    def __init__(self):
        self.clients = []
        self.lock = threading.Lock()
        self.last_preview = None

    def add(self):
        client = queue.Queue()
        with self.lock:
            self.clients.append(client)
            if self.last_preview is not None:
                client.put(f"event: preview\ndata: {self.last_preview}\n\n")
        return client

    def remove(self, client):
        with self.lock:
            if client in self.clients:
                self.clients.remove(client)

    def publish(self, event, data):
        payload = f"event: {event}\ndata: {data}\n\n"
        with self.lock:
            if event == "preview":
                self.last_preview = data
            for client in list(self.clients):
                client.put(payload)


hub = Hub()
stop_event = threading.Event()


def serial_worker(port, baud):
    while not stop_event.is_set():
        try:
            with serial.Serial(port, baudrate=baud, timeout=1) as ser:
                print(f"Moniteur e-paper: connecte a {port} ({baud} bauds)")
                hub.publish("log", json.dumps(f"connecte a {port}"))
                while not stop_event.is_set():
                    raw = ser.readline()
                    if not raw:
                        continue
                    line = raw.decode("utf-8", errors="replace").strip()
                    if line.startswith("PREVIEW:"):
                        payload = line[len("PREVIEW:"):]
                        json.loads(payload)
                        hub.publish("preview", payload)
                    elif line:
                        hub.publish("log", json.dumps(line))
        except Exception as exc:
            message = f"serie indisponible: {exc}"
            print(message)
            hub.publish("log", json.dumps(message))
            stop_event.wait(2)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            client = hub.add()
            try:
                while True:
                    self.wfile.write(client.get().encode("utf-8"))
                    self.wfile.flush()
            except Exception:
                hub.remove(client)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(HTML.encode("utf-8"))

    def log_message(self, fmt, *args):
        return


def main():
    parser = argparse.ArgumentParser(description="Miroir local de l'ecran Liste Frigo.")
    parser.add_argument("--port", default="/dev/cu.usbmodem2201")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--http-port", type=int, default=8765)
    args = parser.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", args.http_port), Handler)
    threading.Thread(target=serial_worker, args=(args.port, args.baud), daemon=True).start()
    print(f"Ouvre http://127.0.0.1:{args.http_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        stop_event.set()
        server.server_close()
        print("\nMoniteur e-paper: arret")


if __name__ == "__main__":
    main()
