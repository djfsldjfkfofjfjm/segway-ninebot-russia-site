// Глобальное исправление для видео на мобильных устройствах
document.addEventListener('DOMContentLoaded', function() {
    function fixAllVideos() {
        // Находим ВСЕ видео элементы на странице
        const allVideos = document.querySelectorAll('video');
        
        allVideos.forEach(video => {
            // Удаляем любые классы, которые могут скрывать видео
            video.classList.remove('home-banner_mobile_hidden');
            
            // Добавляем необходимые атрибуты
            video.setAttribute('muted', '');
            video.setAttribute('autoplay', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            
            if (video.hasAttribute('loop')) {
                video.setAttribute('loop', '');
            }
            
            // Форсируем видимость через inline стили
            video.style.display = 'block';
            video.style.visibility = 'visible';
            video.style.opacity = '1';
            
            // Добавляем контролы для мобильных
            if (window.innerWidth <= 1023) {
                video.controls = true;
                
                // Перезагружаем и пытаемся воспроизвести
                video.load();
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        // Если автовоспроизведение работает, убираем контролы
                        video.controls = false;
                    }).catch(error => {
                        // Оставляем контролы для ручного запуска
                        video.controls = true;
                        console.log('Видео требует ручного запуска');
                    });
                }
            }
            
            // НЕ трогаем родительские элементы, работаем только с видео
        });
        
        // Специальная обработка для home-brand-module видео
        if (window.innerWidth <= 1023) {
            // Исправляем ТОЛЬКО видео элементы, не трогаем контейнеры
            const allBrandModuleVideos = document.querySelectorAll('.home-brand-module_wrapper video');
            allBrandModuleVideos.forEach(video => {
                video.style.display = 'block';
                video.style.visibility = 'visible';
                video.style.opacity = '1';
                
                // Убеждаемся что источники загружены
                const sources = video.querySelectorAll('source');
                sources.forEach(source => {
                    if (!source.src && source.dataset.src) {
                        source.src = source.dataset.src;
                    }
                });
                
                // Добавляем контролы
                video.controls = true;
                
                // Перезагружаем видео
                video.load();
                
                // Пытаемся воспроизвести
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        video.controls = false;
                    }).catch(() => {
                        video.controls = true;
                    });
                }
            });
        }
    }
    
    // Запускаем исправления
    fixAllVideos();
    
    // Повторяем через интервалы для динамического контента
    setTimeout(fixAllVideos, 1000);
    setTimeout(fixAllVideos, 2000);
    setTimeout(fixAllVideos, 3000);
    
    // Слушаем изменения DOM
    const observer = new MutationObserver(function(mutations) {
        let hasVideoChanges = false;
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeName === 'VIDEO' || (node.querySelectorAll && node.querySelectorAll('video').length)) {
                        hasVideoChanges = true;
                    }
                });
            }
        });
        
        if (hasVideoChanges) {
            setTimeout(fixAllVideos, 100);
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

// Дополнительная обработка при изменении размера окна
window.addEventListener('resize', function() {
    setTimeout(function() {
        const allVideos = document.querySelectorAll('video');
        allVideos.forEach(video => {
            if (window.innerWidth <= 1023) {
                video.style.display = 'block';
                video.style.visibility = 'visible';
                video.style.opacity = '1';
            }
        });
    }, 500);
});