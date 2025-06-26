// Скрипт для исправления автовоспроизведения видео
document.addEventListener('DOMContentLoaded', function() {
    // Ждем немного для загрузки всех элементов
    setTimeout(function() {
        // Находим все видео элементы
        const videos = document.querySelectorAll('video');
        
        videos.forEach(function(video) {
            // Проверяем источники видео
            const sources = video.querySelectorAll('source');
            sources.forEach(function(source) {
                // Убеждаемся что у источника есть src
                if (\!source.src && source.dataset.src) {
                    source.src = source.dataset.src;
                }
            });
            
            // Принудительно загружаем видео
            video.load();
            
            // Пытаемся воспроизвести видео
            video.play().catch(function(error) {
                console.log('Ошибка воспроизведения видео:', error);
                // Если не удалось, пробуем еще раз через секунду
                setTimeout(function() {
                    video.play().catch(function(err) {
                        console.log('Повторная ошибка:', err);
                    });
                }, 1000);
            });
        });
        
        console.log('Обработано видео:', videos.length);
    }, 500);
});
