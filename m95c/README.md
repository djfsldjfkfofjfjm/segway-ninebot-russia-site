# Ninebot M+ Series Website (Очищенная версия)

Сайт электроскутеров Ninebot M+ без трекинга и аналитики.

## Структура проекта

```
/
├── index.html                    # Главная страница
├── favicon.svg                   # Иконка сайта
├── sections/                     # HTML секции
│   ├── product-gallery.html      # Галерея продуктов
│   ├── secondary-nav.html        # Вторичная навигация (модели)
│   └── topbar.html              # Верхняя панель с кнопкой покупки
└── 九号M+ 系列...html_files/     # Ресурсы (CSS, изображения)
```

## Как запустить

### Вариант 1: Python HTTP сервер
```bash
python3 -m http.server 8000
```
Откройте http://localhost:8000

### Вариант 2: Node.js HTTP сервер
```bash
npx http-server -p 8000
```
Откройте http://localhost:8000

### Вариант 3: Просто откройте index.html в браузере

## Что было удалено
- Все скрипты аналитики (Google, Adobe, китайские трекеры)
- Все внешние ссылки на ninebot.com и segway.com
- Header и Footer
- Трекинг атрибуты и классы

## Оригинальные файлы
- `九号M+ 系列...html` - исходный файл сайта
- `九号M+ 系列...html_files/` - папка с ресурсами