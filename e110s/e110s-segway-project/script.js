// Preloader
window.addEventListener('load', () => {
    const preloader = document.querySelector('.preloader');
    setTimeout(() => {
        preloader.classList.add('hide');
    }, 1500);
});

// Navigation scroll effect
const navbar = document.querySelector('.navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
    
    lastScroll = currentScroll;
});

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Mobile menu toggle
const navBurger = document.querySelector('.nav-burger');
const navMenu = document.querySelector('.nav-menu');

navBurger?.addEventListener('click', () => {
    navBurger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Counter animation
function animateCounter(element, target) {
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;
    
    const timer = setInterval(() => {
        current += step;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current);
    }, 16);
}

// Animate counters when in view
const observerOptions = {
    threshold: 0.5,
    rootMargin: '0px'
};

const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.animated) {
            const target = parseInt(entry.target.dataset.count);
            animateCounter(entry.target, target);
            entry.target.animated = true;
        }
    });
}, observerOptions);

document.querySelectorAll('.stat-number').forEach(counter => {
    counterObserver.observe(counter);
});

// Animate elements on scroll
const animateOnScroll = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animated');
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
});

// Add animation class to elements
document.querySelectorAll('.pain-card, .feature-block, .timeline-item, .spec-card, .safety-item, .faq-item').forEach(el => {
    el.classList.add('animate-on-scroll');
    animateOnScroll.observe(el);
});

// Color selector
const colorOptions = document.querySelectorAll('.color-option');
const colorName = document.querySelector('.color-name');

const colorNames = {
    white: 'Арктический белый',
    black: 'Фантомный чёрный',
    grey: 'Стальной серый',
    matte: 'Каменный серый (матовый)',
    red: 'Интенсивный красный'
};

colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        // Remove active class from all
        colorOptions.forEach(opt => opt.classList.remove('active'));
        // Add active to clicked
        option.classList.add('active');
        // Update color name
        const color = option.dataset.color;
        colorName.textContent = colorNames[color];
        
        // Show color preview
        const colorPreview = document.querySelector('#color-preview');
        const colorPreviewCircle = document.querySelector('#color-preview-circle');
        const colorPreviewText = document.querySelector('#color-preview-text');
        
        if (colorPreview) {
            colorPreviewCircle.style.background = option.style.background;
            colorPreviewText.textContent = colorNames[color];
            colorPreview.style.display = 'block';
            
            // Hide after 2 seconds
            setTimeout(() => {
                colorPreview.style.display = 'none';
            }, 2000);
        }
        
        // Visual feedback on image
        const scooterImage = document.querySelector('#scooter-image');
        scooterImage.style.transition = 'opacity 0.3s';
        scooterImage.style.opacity = '0.8';
        setTimeout(() => {
            scooterImage.style.opacity = '1';
        }, 300);
    });
});

function getHueRotation(color) {
    const rotations = {
        white: 0,
        black: 0,
        grey: 0,
        matte: 0,
        red: -30
    };
    return rotations[color] || 0;
}

// Calculator
const taxiInput = document.querySelector('#taxi');
const metroInput = document.querySelector('#metro');
const carsharingInput = document.querySelector('#carsharing');
const resultMonths = document.querySelector('.result-months');
const resultSavings = document.querySelector('.result-savings span');

function calculateSavings() {
    const taxi = parseInt(taxiInput?.value) || 0;
    const metro = parseInt(metroInput?.value) || 0;
    const carsharing = parseInt(carsharingInput?.value) || 0;
    
    const totalMonthly = taxi + metro + carsharing;
    const scooterPrice = 225000; // Actual price
    const monthsToPayback = Math.ceil(scooterPrice / totalMonthly);
    
    if (resultMonths) {
        resultMonths.textContent = `${monthsToPayback} месяцев`;
    }
    if (resultSavings) {
        resultSavings.textContent = `${totalMonthly.toLocaleString('ru-RU')} ₽/мес`;
    }
}

// Add event listeners to calculator inputs
[taxiInput, metroInput, carsharingInput].forEach(input => {
    input?.addEventListener('input', calculateSavings);
});

// Initial calculation
calculateSavings();

// Show detailed specs
const showSpecsBtn = document.querySelector('#show-all-specs');
const detailedSpecs = document.querySelector('#detailed-specs');

showSpecsBtn?.addEventListener('click', () => {
    if (detailedSpecs.style.display === 'block') {
        detailedSpecs.style.display = 'none';
        showSpecsBtn.textContent = 'Все характеристики';
    } else {
        detailedSpecs.style.display = 'block';
        showSpecsBtn.textContent = 'Скрыть характеристики';
        // Here you would load the detailed specs
        loadDetailedSpecs();
    }
});

function loadDetailedSpecs() {
    // This would be loaded from a data source
    const specs = `
        <div class="specs-detailed">
            <h3>Подробные характеристики</h3>
            <div class="specs-categories">
                <div class="spec-category">
                    <h4>Двигатель и производительность</h4>
                    <dl>
                        <dt>Номинальная мощность</dt>
                        <dd>350 Вт (25 км/ч) / 1000 Вт (45 км/ч)</dd>
                        <dt>Максимальная мощность</dt>
                        <dd>1500 Вт</dd>
                        <dt>Крутящий момент</dt>
                        <dd>88 Н·м</dd>
                        <dt>Угол подъема</dt>
                        <dd>До 11°</dd>
                    </dl>
                </div>
                <!-- More categories... -->
            </div>
        </div>
    `;
    detailedSpecs.innerHTML = specs;
}

// Form submission
const testDriveForm = document.querySelector('#test-drive-form');

testDriveForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Add loading state
    const submitBtn = testDriveForm.querySelector('button[type="submit"]');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    // Simulate form submission
    setTimeout(() => {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        submitBtn.textContent = '✓ Заявка отправлена!';
        submitBtn.style.background = '#4CAF50';
        
        // Reset form
        setTimeout(() => {
            testDriveForm.reset();
            submitBtn.textContent = 'Забронировать тест-драйв';
            submitBtn.style.background = '';
        }, 3000);
    }, 2000);
});

// Mobile CTA scroll behavior
const mobileCTA = document.querySelector('.mobile-cta');
const ctaSection = document.querySelector('.cta-section');

if (mobileCTA && ctaSection) {
    window.addEventListener('scroll', () => {
        const ctaRect = ctaSection.getBoundingClientRect();
        if (ctaRect.top < window.innerHeight && ctaRect.bottom > 0) {
            mobileCTA.style.display = 'none';
        } else {
            mobileCTA.style.display = 'block';
        }
    });
}

// Mobile CTA click
const mobileCTABtn = document.querySelector('.mobile-cta button');
mobileCTABtn?.addEventListener('click', () => {
    ctaSection.scrollIntoView({ behavior: 'smooth' });
});

// Video lazy loading
const videos = document.querySelectorAll('video');
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const video = entry.target;
            if (video.dataset.src) {
                video.src = video.dataset.src;
                video.load();
                delete video.dataset.src;
            }
        }
    });
}, {
    rootMargin: '100px'
});

videos.forEach(video => {
    videoObserver.observe(video);
});

// Phone number formatting
const phoneInput = document.querySelector('input[type="tel"]');
phoneInput?.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    let formattedValue = '';
    
    if (value.length > 0) {
        formattedValue = '+7 ';
        if (value.length > 1) {
            formattedValue += '(' + value.substring(1, 4);
            if (value.length >= 4) {
                formattedValue += ') ';
                if (value.length > 4) {
                    formattedValue += value.substring(4, 7);
                    if (value.length >= 7) {
                        formattedValue += '-';
                        if (value.length > 7) {
                            formattedValue += value.substring(7, 9);
                            if (value.length >= 9) {
                                formattedValue += '-';
                                if (value.length > 9) {
                                    formattedValue += value.substring(9, 11);
                                }
                            }
                        }
                    }
                }
            } else {
                formattedValue += value.substring(1);
            }
        }
    }
    
    e.target.value = formattedValue;
});

// Easter egg: Konami code
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
    if (e.key === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
            activateEasterEgg();
            konamiIndex = 0;
        }
    } else {
        konamiIndex = 0;
    }
});

function activateEasterEgg() {
    document.body.style.animation = 'rainbow 2s linear infinite';
    setTimeout(() => {
        document.body.style.animation = '';
    }, 5000);
}

// Add rainbow animation
const style = document.createElement('style');
style.textContent = `
    @keyframes rainbow {
        0% { filter: hue-rotate(0deg); }
        100% { filter: hue-rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Performance monitoring
if ('performance' in window) {
    window.addEventListener('load', () => {
        const perfData = window.performance.timing;
        const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
        console.log(`Page load time: ${pageLoadTime}ms`);
        
        // Send to analytics
        if (window.gtag) {
            gtag('event', 'timing_complete', {
                'name': 'load',
                'value': pageLoadTime
            });
        }
    });
}

// Prevent FOUC (Flash of Unstyled Content)
document.documentElement.className = 'js';

// Service Worker registration (for PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Service worker registration failed
        });
    });
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('E110S Landing Page Initialized! 🚀');
});