// Оптимизированная загрузка видео по требованию
(function() {
    'use strict';
    
    // Конвертируем все video элементы в lazy-load версии
    function convertVideosToLazy() {
        const videos = document.querySelectorAll('video');
        
        videos.forEach((video, index) => {
            // Получаем информацию о видео
            const sources = video.querySelectorAll('source');
            const poster = video.getAttribute('poster') || '';
            const videoSrc = sources.length > 0 ? sources[0].src : video.src;
            
            // Создаем контейнер для lazy-load
            const container = document.createElement('div');
            container.className = 'video-lazy-container';
            container.setAttribute('data-video-src', videoSrc);
            container.setAttribute('data-video-index', index);
            
            // Создаем превью
            const preview = document.createElement('div');
            preview.className = 'video-preview';
            preview.style.cssText = `
                position: relative;
                width: 100%;
                height: 100%;
                cursor: pointer;
                background-image: url('${poster}');
                background-size: cover;
                background-position: center;
                min-height: 400px;
            `;
            
            // Создаем кнопку play
            const playButton = document.createElement('div');
            playButton.className = 'play-button';
            playButton.innerHTML = `
                <svg width="68" height="48" viewBox="0 0 68 48" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                    <path d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z" fill="#212121" fill-opacity="0.8"></path>
                    <path d="M 45,24 27,14 27,34" fill="#fff"></path>
                </svg>
            `;
            
            preview.appendChild(playButton);
            container.appendChild(preview);
            
            // Заменяем видео на lazy-контейнер
            video.parentNode.replaceChild(container, video);
            
            // Добавляем обработчик клика
            container.addEventListener('click', function() {
                loadVideo(container, videoSrc, poster);
            });
        });
    }
    
    // Загрузка видео по клику
    function loadVideo(container, src, poster) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsinline = true;
        video.setAttribute('webkit-playsinline', '');
        video.poster = poster;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        
        const source = document.createElement('source');
        source.src = src;
        source.type = 'video/mp4';
        
        video.appendChild(source);
        container.innerHTML = '';
        container.appendChild(video);
        
        // Начинаем воспроизведение
        video.play().catch(e => console.log('Ошибка воспроизведения:', e));
    }
    
    // Intersection Observer для автозагрузки видео при приближении
    function setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: '50px',
            threshold: 0.1
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const container = entry.target;
                    const src = container.getAttribute('data-video-src');
                    const poster = container.querySelector('.video-preview').style.backgroundImage.match(/url\(['"]?(.+?)['"]?\)/)?.[1] || '';
                    
                    // Автоматически загружаем видео для первых 3 элементов
                    const index = parseInt(container.getAttribute('data-video-index'));
                    if (index < 3) {
                        loadVideo(container, src, poster);
                        observer.unobserve(container);
                    }
                }
            });
        }, options);
        
        // Наблюдаем за всеми lazy-контейнерами
        document.querySelectorAll('.video-lazy-container').forEach(container => {
            observer.observe(container);
        });
    }
    
    // Запускаем оптимизацию после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            convertVideosToLazy();
            setupIntersectionObserver();
        });
    } else {
        convertVideosToLazy();
        setupIntersectionObserver();
    }
})();

// Стили для lazy-load видео
const style = document.createElement('style');
style.textContent = `
    .video-lazy-container {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
    }
    
    .video-preview {
        transition: transform 0.3s ease;
    }
    
    .video-lazy-container:hover .video-preview {
        transform: scale(1.02);
    }
    
    .play-button {
        transition: opacity 0.3s ease;
    }
    
    .video-lazy-container:hover .play-button {
        opacity: 0.8;
    }
`;
document.head.appendChild(style);