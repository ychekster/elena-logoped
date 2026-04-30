const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

(function preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    let hadMultiTouch = false;

    document.addEventListener(
        'touchstart',
        (event) => {
            hadMultiTouch = event.touches.length > 1;
        },
        { passive: true }
    );

    document.addEventListener(
        'touchend',
        (event) => {
            if (hadMultiTouch || event.changedTouches.length !== 1) {
                if (event.touches.length === 0) {
                    hadMultiTouch = false;
                }

                return;
            }

            const now = Date.now();

            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }

            lastTouchEnd = now;
        },
        { passive: false }
    );
})();

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
    const modal = document.getElementById('review-modal');
    const modalOverlay = document.getElementById('review-modal-overlay');
    const modalClose = document.getElementById('review-modal-close');
    const modalStars = document.getElementById('review-modal-stars');
    const modalText = document.getElementById('review-modal-text');
    const modalName = document.getElementById('review-modal-name');
    const modalMeta = document.getElementById('review-modal-meta');

    if (
        !track ||
        !btnPrev ||
        !btnNext ||
        !currentPageElement ||
        !totalPagesElement ||
        !modal ||
        !modalOverlay ||
        !modalClose ||
        !modalStars ||
        !modalText ||
        !modalName ||
        !modalMeta
    ) {
        return;
    }

    const LONG_REVIEW_LENGTH = 220;
    const PER_PAGE = {
        desktop: 6,
        tablet: 4,
        mobile: 1,
    };

    let currentPage = 0;
    let touchStartX = 0;
    let resizeTimerId;

    const getCards = () => Array.from(track.querySelectorAll('.reviews__card'));

    const openReviewModal = (card) => {
        const stars = card.querySelector('.reviews__card-stars');
        const text = card.querySelector('.reviews__card-text');
        const name = card.querySelector('.reviews__card-name');
        const meta = card.querySelector('.reviews__card-meta');

        if (!stars || !text || !name || !meta) {
            return;
        }

        modalStars.innerHTML = stars.innerHTML;
        modalText.textContent = text.textContent;
        modalName.textContent = name.textContent;
        modalMeta.textContent = meta.textContent;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    };

    const closeReviewModal = () => {
        modal.hidden = true;
        document.body.style.overflow = '';
    };

    const initLongReviews = () => {
        getCards().forEach((card) => {
            const text = card.querySelector('.reviews__card-text');
            const author = card.querySelector('.reviews__card-author');

            if (!text || !author || text.textContent.trim().length <= LONG_REVIEW_LENGTH) {
                return;
            }

            text.classList.add('reviews__card-text--clamped');
            card.classList.add('reviews__card--long');

            const button = document.createElement('button');
            button.className = 'reviews__read-more';
            button.type = 'button';
            button.textContent = 'Читать далее...';
            button.addEventListener('click', () => openReviewModal(card));

            author.before(button);
        });
    };

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

    modalClose.addEventListener('click', closeReviewModal);
    modalOverlay.addEventListener('click', closeReviewModal);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.hidden) {
            closeReviewModal();
        }
    });

    initLongReviews();
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
    const submitButton = form?.querySelector('button[type="submit"]');
    const modalIcon = modal?.querySelector('.modal__icon');
    const modalTitle = modal?.querySelector('.modal__title');
    const modalText = modal?.querySelector('.modal__text');

    if (!form || !modal || !overlay || !closeButton || !submitButton || !modalIcon || !modalTitle || !modalText) {
        return;
    }

    const defaultSubmitText = submitButton.textContent;
    let isSubmitting = false;
    const modalContent = {
        success: {
            title: 'Заявка отправлена',
            text: 'Отвечу в течение дня. Спасибо, что обратились.',
            icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        },
        error: {
            title: 'Не удалось отправить заявку',
            text: 'Пожалуйста, попробуйте ещё раз или напишите напрямую в Telegram или WhatsApp.',
            icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        },
    };

    const getRequiredFields = () => Array.from(form.querySelectorAll('[required]'));

    const setSubmitState = (isLoading) => {
        submitButton.disabled = isLoading;
        submitButton.textContent = isLoading ? 'Отправляется...' : defaultSubmitText;
    };

    const setModalContent = (type) => {
        const content = modalContent[type];

        modal.classList.toggle('modal--error', type === 'error');
        modalIcon.innerHTML = content.icon;
        modalTitle.textContent = content.title;
        modalText.textContent = content.text;
    };

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

        if (isSubmitting) {
            return;
        }

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
            isSubmitting = true;
            setSubmitState(true);

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
            setModalContent('success');
            openModal();
        } catch (error) {
            setModalContent('error');
            openModal();
        } finally {
            isSubmitting = false;
            setSubmitState(false);
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
