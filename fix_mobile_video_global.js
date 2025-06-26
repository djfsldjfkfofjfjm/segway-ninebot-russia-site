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
            
            // Проверяем все родительские элементы на скрытие
            let parent = video.parentElement;
            while (parent && parent !== document.body) {
                const computed = window.getComputedStyle(parent);
                if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') {
                    // Если это контейнер видео с классом segway-pc и мы на мобильном
                    if (window.innerWidth <= 1023 && parent.classList.contains('segway-pc')) {
                        // Пропускаем, так как это нормально
                    } else if (window.innerWidth <= 1023 && parent.classList.contains('segway-mobile')) {
                        // Форсируем показ мобильного контейнера
                        parent.style.display = 'block';
                        parent.style.visibility = 'visible';
                        parent.style.opacity = '1';
                    }
                }
                parent = parent.parentElement;
            }
        });
        
        // Специальная обработка для home-brand-module видео
        if (window.innerWidth <= 1023) {
            // Для мобильной версии карусели
            const mobileSwiperVideos = document.querySelectorAll('.home-brand-module-swiper_m video');
            mobileSwiperVideos.forEach(video => {
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
                
                // Перезагружаем видео
                video.load();
            });
            
            // Для десктопной версии на мобильных (если она показывается)
            const desktopSwiperVideos = document.querySelectorAll('.home-brand-module_pc video');
            desktopSwiperVideos.forEach(video => {
                // Проверяем, должно ли это видео показываться на мобильных
                const wrapper = video.closest('.home-brand-module_pc');
                if (wrapper && window.getComputedStyle(wrapper).display !== 'none') {
                    video.style.display = 'block';
                    video.style.visibility = 'visible';
                    video.style.opacity = '1';
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