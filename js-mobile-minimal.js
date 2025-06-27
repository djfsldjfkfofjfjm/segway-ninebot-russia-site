// js-mobile-minimal.js - Минимальный JS для мобильной версии (без jQuery)
// Размер: < 50KB, только критическая функциональность

(function() {
  'use strict';

  // Ждем загрузку DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // 1. НАВИГАЦИЯ И КНОПКИ
    initButtons();
    
    // 2. ПРОСТОЙ СЛАЙДЕР (без Swiper)
    initSimpleSlider();
    
    // 3. ЛЕНИВАЯ ЗАГРУЗКА ИЗОБРАЖЕНИЙ
    initLazyLoad();
    
    // 4. МОБИЛЬНОЕ МЕНЮ
    initMobileMenu();
    
    // 5. ПЛАВНАЯ ПРОКРУТКА
    initSmoothScroll();
  }

  // === 1. ОБРАБОТКА КНОПОК ===
  function initButtons() {
    // Обработка всех кнопок с классом catchTrack
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.catchTrack, .common-btn_medium, .common-btn_small');
      if (!btn) return;
      
      e.preventDefault();
      
      // Получаем URL из data атрибута или href
      const buttonData = btn.getAttribute('data-button-item');
      let url = btn.getAttribute('href');
      
      if (buttonData) {
        try {
          const data = JSON.parse(buttonData);
          url = data.url || url;
        } catch(e) {}
      }
      
      if (url && url !== '#' && url !== 'javascript:void(0)') {
        window.location.href = url;
      }
    });
  }

  // === 2. ПРОСТОЙ СЛАЙДЕР (CSS Scroll Snap) ===
  function initSimpleSlider() {
    const sliders = document.querySelectorAll('.s-primary-banner-swiper');
    
    sliders.forEach(slider => {
      const wrapper = slider.querySelector('.swiper-wrapper');
      const slides = slider.querySelectorAll('.swiper-slide');
      const pagination = slider.querySelector('.swiper-pagination');
      
      if (!wrapper || !slides.length) return;
      
      // Преобразуем в CSS scroll-snap контейнер
      wrapper.style.display = 'flex';
      wrapper.style.overflowX = 'auto';
      wrapper.style.scrollSnapType = 'x mandatory';
      wrapper.style.scrollBehavior = 'smooth';
      wrapper.style.WebkitOverflowScrolling = 'touch';
      
      slides.forEach(slide => {
        slide.style.scrollSnapAlign = 'start';
        slide.style.flexShrink = '0';
        slide.style.width = '100%';
      });
      
      // Скрываем scrollbar
      wrapper.style.scrollbarWidth = 'none';
      wrapper.style.msOverflowStyle = 'none';
      wrapper.style.cssText += '::-webkit-scrollbar { display: none; }';
      
      // Обновляем пагинацию при скролле
      if (pagination) {
        let scrollTimeout;
        wrapper.addEventListener('scroll', function() {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => {
            const slideWidth = slides[0].offsetWidth;
            const currentIndex = Math.round(wrapper.scrollLeft / slideWidth);
            updatePagination(pagination, currentIndex);
          }, 150);
        });
        
        // Клики по точкам пагинации
        pagination.addEventListener('click', function(e) {
          const bullet = e.target.closest('.swiper-pagination-bullet');
          if (!bullet) return;
          
          const bullets = Array.from(pagination.querySelectorAll('.swiper-pagination-bullet'));
          const index = bullets.indexOf(bullet);
          
          if (index >= 0 && slides[index]) {
            slides[index].scrollIntoView({ behavior: 'smooth', inline: 'start' });
          }
        });
      }
    });
  }
  
  function updatePagination(pagination, activeIndex) {
    const bullets = pagination.querySelectorAll('.swiper-pagination-bullet');
    bullets.forEach((bullet, index) => {
      if (index === activeIndex) {
        bullet.classList.add('swiper-pagination-bullet-active');
      } else {
        bullet.classList.remove('swiper-pagination-bullet-active');
      }
    });
  }

  // === 3. ЛЕНИВАЯ ЗАГРУЗКА ===
  function initLazyLoad() {
    // Используем нативный Intersection Observer
    if ('IntersectionObserver' in window) {
      const images = document.querySelectorAll('img[loading="lazy"]');
      
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            // Если есть data-src, используем его
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
            }
            img.classList.add('loaded');
            observer.unobserve(img);
          }
        });
      }, {
        rootMargin: '50px 0px',
        threshold: 0.01
      });
      
      images.forEach(img => imageObserver.observe(img));
    }
  }

  // === 4. МОБИЛЬНОЕ МЕНЮ ===
  function initMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle, .menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu, .nav-mobile');
    
    if (menuToggle && mobileMenu) {
      menuToggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const isOpen = mobileMenu.classList.contains('active') || 
                      mobileMenu.classList.contains('open');
        
        if (isOpen) {
          mobileMenu.classList.remove('active', 'open');
          document.body.style.overflow = '';
        } else {
          mobileMenu.classList.add('active', 'open');
          document.body.style.overflow = 'hidden';
        }
      });
      
      // Закрытие при клике вне меню
      document.addEventListener('click', function(e) {
        if (!mobileMenu.contains(e.target) && !menuToggle.contains(e.target)) {
          mobileMenu.classList.remove('active', 'open');
          document.body.style.overflow = '';
        }
      });
    }
  }

  // === 5. ПЛАВНАЯ ПРОКРУТКА ===
  function initSmoothScroll() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      
      const href = link.getAttribute('href');
      if (href === '#') return;
      
      e.preventDefault();
      
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  }

  // === УТИЛИТЫ ===
  
  // Debounce для оптимизации
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Проверка видимости элемента
  function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }
  
  // === ОПТИМИЗАЦИЯ ПРОИЗВОДИТЕЛЬНОСТИ ===
  
  // Отключаем hover эффекты при скролле
  let scrollTimer;
  window.addEventListener('scroll', function() {
    if (!document.body.classList.contains('disable-hover')) {
      document.body.classList.add('disable-hover');
    }
    
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      document.body.classList.remove('disable-hover');
    }, 250);
  }, { passive: true });
  
  // === ПОЛИФИЛЛЫ ДЛЯ СТАРЫХ БРАУЗЕРОВ ===
  
  // Element.closest
  if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
      var el = this;
      do {
        if (el.matches(s)) return el;
        el = el.parentElement || el.parentNode;
      } while (el !== null && el.nodeType === 1);
      return null;
    };
  }
  
  // Element.matches
  if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || 
                              Element.prototype.webkitMatchesSelector;
  }

})();

// === CSS СТИЛИ ДЛЯ ОПТИМИЗАЦИИ ===
// Добавляем критические стили для мобильных
(function() {
  const style = document.createElement('style');
  style.textContent = `
    /* Отключение hover при скролле */
    .disable-hover,
    .disable-hover * {
      pointer-events: none !important;
    }
    
    /* Оптимизация анимаций */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
    
    /* Скрытие scrollbar для слайдеров */
    .swiper-wrapper::-webkit-scrollbar {
      display: none;
    }
    
    /* Плавные переходы */
    .loaded {
      opacity: 1;
      transition: opacity 0.3s;
    }
    
    img:not(.loaded) {
      opacity: 0;
    }
  `;
  document.head.appendChild(style);
})();