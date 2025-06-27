// mobile-video-blocker.js
// Блокирует загрузку видео ТОЛЬКО в мобильных блоках (.segway-mobile)
// НЕ трогает ПК версию!
// Также блокирует тяжелые скрипты для мобильных

(function() {
  const isMobile = window.innerWidth <= 768 || 
    /Android|iPhone|iPad/i.test(navigator.userAgent);
  
  if (isMobile) {
    // Устанавливаем флаг для блокировки тяжелых скриптов
    window.blockHeavyScripts = true;
    // Функция блокировки видео
    function blockMobileVideos() {
      // Блокируем видео ТОЛЬКО в .segway-mobile блоках
      document.querySelectorAll('.segway-mobile video').forEach(v => {
        v.removeAttribute('src');
        v.removeAttribute('autoplay');
        v.preload = 'none';
        const sources = v.querySelectorAll('source');
        sources.forEach(s => s.removeAttribute('src'));
      });
      
      // Также блокируем видео в .home-brand-module_mobile если есть
      document.querySelectorAll('.home-brand-module_mobile video').forEach(v => {
        v.removeAttribute('src');
        v.removeAttribute('autoplay');
        v.preload = 'none';
        const sources = v.querySelectorAll('source');
        sources.forEach(s => s.removeAttribute('src'));
      });
      
      // НЕ удаляем .segway-mobile блоки - они нужны для контента!
    }
    
    // Запускаем блокировку сразу
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', blockMobileVideos);
    } else {
      blockMobileVideos();
    }
    
    // Наблюдаем за динамически добавляемым контентом
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.querySelector) {
              // Блокируем только новые видео
              const newVideos = node.querySelectorAll('.segway-mobile video');
              newVideos.forEach(v => {
                v.removeAttribute('src');
                v.removeAttribute('autoplay');
                v.preload = 'none';
                const sources = v.querySelectorAll('source');
                sources.forEach(s => s.removeAttribute('src'));
              });
            }
          });
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
})();