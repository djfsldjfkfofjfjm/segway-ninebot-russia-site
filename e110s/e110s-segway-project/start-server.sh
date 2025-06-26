#!/bin/bash

echo "Запускаю веб-сервер..."
echo "Откройте в браузере: http://localhost:8080/test-simple.html"
echo "Или основную страницу: http://localhost:8080/index.html"
echo ""
echo "Для остановки сервера нажмите Ctrl+C"
echo ""

cd "$(dirname "$0")"
python3 -m http.server 8080