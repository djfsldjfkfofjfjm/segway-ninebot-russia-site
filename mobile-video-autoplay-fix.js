// Скрипт для гарантированного автозапуска видео на мобильных устройствах
(function() {
    // Проверяем, мобильное ли устройство
    if (window.innerWidth > 1023) return;

    // Функция инициализации
    function initVideos() {
        document.querySelectorAll('video').forEach(video => {
            // Обеспечиваем наличие необходимых атрибутов
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('muted', '');
            video.muted = true;
            video.setAttribute('autoplay', '');
            video.autoplay = true;
            video.classList.remove('home-banner_mobile_hidden');
        });
    }

    // Пытаемся запустить все видео
    function playAll() {
        document.querySelectorAll('video').forEach(video => {
            const playPromise = video.play();
            if (playPromise) {
                playPromise.catch(() => {
                    video.controls = true;
                });
            }
        });
    }

    // Инициализируем после загрузки DOM
    document.addEventListener('DOMContentLoaded', () => {
        initVideos();
        playAll();
        // Повторяем попытку после пользовательского взаимодействия
        document.addEventListener('touchstart', playAll, { once: true });
    });
})();
