#!/usr/bin/env python3
"""
Простой HTTP сервер для тестирования сайта M3 95C MAX
"""

import http.server
import socketserver
import os

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Добавляем CORS заголовки для работы с локальными файлами
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

# Меняем текущую директорию на директорию скрипта
os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print(f"Сервер запущен на http://localhost:{PORT}")
    print("Для остановки сервера нажмите Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен")