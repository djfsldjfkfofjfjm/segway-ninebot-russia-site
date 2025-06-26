#!/usr/bin/env python3
import http.server
import socketserver
import os

# Переходим в директорию, где находится скрипт
os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 8766

Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server running at http://localhost:{PORT}/")
    httpd.serve_forever()