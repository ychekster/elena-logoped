const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

(function initHeader() {
    const header = document.getElementById('header');
    const backdrop = document.getElementById('nav-backdrop');

    if (!header || !backdrop) {
        return;
    }

    const burger = header.querySelector('.header__burger');
    const nav = header.querySelector('.header__nav');
    const navLinks = Array.from(header.querySelectorAll('.header__nav-link'));
    const sections = Array.from(document.querySelectorAll('section[id]'));

    if (!burger || !nav) {
        return;
    }

    const setNavState = (isOpen) => {
        burger.classList.toggle('open', isOpen);
        nav.classList.toggle('open', isOpen);
        backdrop.classList.toggle('open', isOpen);
        burger.setAttribute('aria-expanded', String(isOpen));
        document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    const closeNav = () => setNavState(false);

    window.addEventListener(
        'scroll',
        () => {
            header.classList.toggle('scrolled', window.scrollY > 10);
        },
        { passive: true }
    );

    burger.addEventListener('click', () => {
        setNavState(!burger.classList.contains('open'));
    });

    navLinks.forEach((link) => {
        link.addEventListener('click', closeNav);
    });

    backdrop.addEventListener('click', closeNav);

    if (!sections.length || !navLinks.length) {
        return;
    }

    const navObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                navLinks.forEach((link) => {
                    const isActive = link.getAttribute('href') === `#${entry.target.id}`;
                    link.classList.toggle('active', isActive);
                });
            });
        },
        { rootMargin: '-50% 0px -50% 0px' }
    );

    sections.forEach((section) => {
        navObserver.observe(section);
    });
})();

(function initReviewsPagination() {
    const track = document.getElementById('reviews-track');
    const btnPrev = document.getElementById('reviews-prev');
    const btnNext = document.getElementById('reviews-next');
    const currentPageElement = document.getElementById('reviews-current');
    const totalPagesElement = document.getElementById('reviews-total');

    if (!track || !btnPrev || !btnNext || !currentPageElement || !totalPagesElement) {
        return;
    }

    const PER_PAGE = {
        desktop: 6,
        tablet: 4,
        mobile: 1,
    };

    let currentPage = 0;
    let touchStartX = 0;
    let resizeTimerId;

    const getCards = () => Array.from(track.querySelectorAll('.reviews__card'));

    const getPerPage = () => {
        if (window.innerWidth <= MOBILE_BREAKPOINT) {
            return PER_PAGE.mobile;
        }

        if (window.innerWidth <= TABLET_BREAKPOINT) {
            return PER_PAGE.tablet;
        }

        return PER_PAGE.desktop;
    };

    const getTotalPages = () => Math.max(1, Math.ceil(getCards().length / getPerPage()));

    const render = () => {
        const cards = getCards();
        const perPage = getPerPage();
        const totalPages = getTotalPages();

        currentPage = Math.min(currentPage, totalPages - 1);

        const from = currentPage * perPage;
        const to = from + perPage;

        cards.forEach((card, index) => {
            card.style.display = index >= from && index < to ? '' : 'none';
        });

        currentPageElement.textContent = String(currentPage + 1);
        totalPagesElement.textContent = String(totalPages);
        btnPrev.disabled = currentPage === 0;
        btnNext.disabled = currentPage === totalPages - 1;
    };

    btnPrev.addEventListener('click', () => {
        currentPage -= 1;
        render();
    });

    btnNext.addEventListener('click', () => {
        currentPage += 1;
        render();
    });

    track.addEventListener(
        'touchstart',
        (event) => {
            touchStartX = event.touches[0].clientX;
        },
        { passive: true }
    );

    track.addEventListener(
        'touchend',
        (event) => {
            const touchEndX = event.changedTouches[0].clientX;
            const swipeDistance = touchStartX - touchEndX;

            if (Math.abs(swipeDistance) <= 50) {
                return;
            }

            if (swipeDistance > 0 && currentPage < getTotalPages() - 1) {
                currentPage += 1;
                render();
            }

            if (swipeDistance < 0 && currentPage > 0) {
                currentPage -= 1;
                render();
            }
        },
        { passive: true }
    );

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimerId);
        resizeTimerId = setTimeout(render, 150);
    });

    render();
})();

(function initFaqAccordion() {
    const items = Array.from(document.querySelectorAll('.faq__item'));

    if (!items.length) {
        return;
    }

    const setItemState = (item, isOpen) => {
        item.classList.toggle('faq__item--open', isOpen);

        const question = item.querySelector('.faq__question');

        if (question) {
            question.setAttribute('aria-expanded', String(isOpen));
        }
    };

    items.forEach((item) => {
        const question = item.querySelector('.faq__question');

        if (!question) {
            return;
        }

        question.addEventListener('click', () => {
            const isOpen = item.classList.contains('faq__item--open');

            items.forEach((faqItem) => {
                setItemState(faqItem, false);
            });

            if (!isOpen) {
                setItemState(item, true);
            }
        });
    });
})();

(function initContactForm() {
    const form = document.getElementById('contact-form');
    const modal = document.getElementById('contact-modal');
    const overlay = document.getElementById('modal-overlay');
    const closeButton = document.getElementById('modal-close');

    if (!form || !modal || !overlay || !closeButton) {
        return;
    }

    const getRequiredFields = () => Array.from(form.querySelectorAll('[required]'));

    const openModal = () => {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        modal.hidden = true;
        document.body.style.overflow = '';
    };

    const clearFieldError = (field) => {
        field.classList.remove('error');
    };

    const validateField = (field) => {
        clearFieldError(field);

        const isValid = field.type === 'checkbox' ? field.checked : Boolean(field.value.trim());

        if (!isValid) {
            field.classList.add('error');
        }

        return isValid;
    };

    const validateForm = () => {
        return getRequiredFields().every(validateField);
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!validateForm()) {
            return;
        }

        const formData = new FormData(form);

        const payload = {
            name: formData.get('name'),
            phone: formData.get('phone'),
            age: formData.get('age'),
            format: formData.get('format'),
            message: formData.get('message')
        };

        try {
            const response = await fetch('/.netlify/functions/send-telegram', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Form submit failed');
            }

            form.reset();
            openModal();
        } catch (error) {
            alert('Не удалось отправить заявку. Напишите напрямую в Telegram или WhatsApp.');
        }
    });

    form.addEventListener('input', (event) => {
        const field = event.target;

        if (!(field instanceof HTMLElement) || !field.classList.contains('error')) {
            return;
        }

        if (field instanceof HTMLInputElement && field.type === 'checkbox') {
            if (field.checked) {
                clearFieldError(field);
            }

            return;
        }

        if (
            (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) &&
            field.value.trim()
        ) {
            clearFieldError(field);
        }
    });

    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.hidden) {
            closeModal();
        }
    });
})();
