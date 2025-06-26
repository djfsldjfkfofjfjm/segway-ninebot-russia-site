// Простой скрипт для минификации HTML
const fs = require('fs');

function minifyHTML(inputFile, outputFile) {
    fs.readFile(inputFile, 'utf8', (err, data) => {
        if (err) {
            console.error('Ошибка чтения файла:', err);
            return;
        }
        
        // Минификация HTML
        let minified = data
            // Удаляем комментарии (кроме условных IE комментариев)
            .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
            // Удаляем лишние пробелы между тегами
            .replace(/>\s+</g, '><')
            // Удаляем пробелы в начале строк
            .replace(/^\s+/gm, '')
            // Удаляем пробелы в конце строк
            .replace(/\s+$/gm, '')
            // Удаляем множественные пробелы
            .replace(/\s{2,}/g, ' ')
            // Удаляем пробелы вокруг = в атрибутах
            .replace(/\s*=\s*/g, '=')
            // Удаляем кавычки у простых атрибутов
            .replace(/="([^"\s]+)"/g, '=$1')
            // Удаляем закрывающие слеши у самозакрывающихся тегов
            .replace(/<(img|br|hr|input|meta|link)([^>]*?)\/>/g, '<$1$2>')
            // Удаляем type="text/javascript" (по умолчанию)
            .replace(/\stype="text\/javascript"/g, '')
            // Удаляем type="text/css" (по умолчанию)
            .replace(/\stype="text\/css"/g, '');
        
        // Сохраняем минифицированный файл
        fs.writeFile(outputFile, minified, 'utf8', (err) => {
            if (err) {
                console.error('Ошибка записи файла:', err);
                return;
            }
            
            // Показываем статистику
            const originalSize = Buffer.byteLength(data, 'utf8');
            const minifiedSize = Buffer.byteLength(minified, 'utf8');
            const savings = originalSize - minifiedSize;
            const percent = ((savings / originalSize) * 100).toFixed(2);
            
            console.log(`Минификация завершена!`);
            console.log(`Исходный размер: ${(originalSize / 1024).toFixed(2)} KB`);
            console.log(`Минифицированный размер: ${(minifiedSize / 1024).toFixed(2)} KB`);
            console.log(`Экономия: ${(savings / 1024).toFixed(2)} KB (${percent}%)`);
        });
    });
}

// Запуск минификации
if (process.argv.length < 3) {
    console.log('Использование: node minify.js <input-file> [output-file]');
    console.log('Пример: node minify.js segway_optimized.html segway_min.html');
} else {
    const inputFile = process.argv[2];
    const outputFile = process.argv[3] || inputFile.replace('.html', '.min.html');
    minifyHTML(inputFile, outputFile);
}