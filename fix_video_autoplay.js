// Скрипт для исправления автовоспроизведения видео
// Запускаем после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    // Короткая задержка, чтобы видео успели появиться
    setTimeout(function() {
        const videos = document.querySelectorAll('video');
        videos.forEach(function(video) {
            // Удаляем класс, скрывающий видео
            video.classList.remove('home-banner_mobile_hidden');

            // Обновляем атрибуты для iOS
            video.setAttribute('muted', '');
            video.setAttribute('autoplay', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('preload', 'metadata');

            video.muted = true;
            video.autoplay = true;
            video.playsInline = true;
            video.preload = 'metadata';

            // Проверяем источники
            video.querySelectorAll('source').forEach(function(source) {
                if (!source.src && source.dataset.src) {
                    source.src = source.dataset.src;
                }
            });

            // Перезагружаем и пытаемся воспроизвести
            video.load();
            video.play().catch(function(error) {
                console.log('Ошибка воспроизведения видео:', error);
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
