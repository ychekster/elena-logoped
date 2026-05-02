const MIN_FORM_FILL_TIME_MS = 3000;
const REPEAT_SUBMIT_WINDOW_MS = 15000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_FIELD_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1000;

const allowedFormats = new Set([
    'Очная диагностика',
    'Очные занятия',
    'Онлайн-диагностика',
    'Онлайн-консультация для родителей',
    'Ещё не знаю, помогите разобраться'
]);

const recentRequests = new Map();

const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
});

const getHeader = (headers, name) => {
    const foundKey = Object.keys(headers || {}).find((key) => key.toLowerCase() === name.toLowerCase());
    return foundKey ? headers[foundKey] : '';
};

const parseBody = (event) => {
    const contentType = getHeader(event.headers, 'content-type').split(';')[0].trim().toLowerCase();
    const body = event.body || '';

    if (!body) {
        return {};
    }

    if (event.isBase64Encoded) {
        throw Object.assign(new Error('Unsupported body encoding'), { statusCode: 415 });
    }

    if (contentType === 'application/json' || contentType === '') {
        try {
            return JSON.parse(body);
        } catch (error) {
            throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
        }
    }

    if (contentType === 'application/x-www-form-urlencoded') {
        return Object.fromEntries(new URLSearchParams(body));
    }

    throw Object.assign(new Error('Unsupported content type'), { statusCode: 415 });
};

const toCleanString = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const hasUrl = (value) => /https?:\/\/|www\.|\.ru\b|\.com\b|\.kz\b|\.net\b|\.org\b/i.test(value);

const hasRepeatedChars = (value) => {
    const compact = value.replace(/\s+/g, '').toLowerCase();
    return compact.length >= 6 && /(.)\1{5,}/u.test(compact);
};

const isGarbageValue = (value) => {
    const compact = value.replace(/[\s+()._-]/g, '').toLowerCase();
    const latinOnly = /^[a-z]+$/i.test(compact);
    const digitsOnly = /^\d+$/.test(compact);
    const knownJunk = /^(test|testing|qwerty|asdf|asdfgh|admin|unknown|none|null|undefined|aaaaaa|123456)$/i;

    return (
        !compact ||
        knownJunk.test(compact) ||
        hasRepeatedChars(value) ||
        (digitsOnly && compact.length < 7) ||
        (latinOnly && compact.length <= 2)
    );
};

const isValidName = (name) => {
    if (name.length < 2 || name.length > 60) {
        return false;
    }

    if (hasUrl(name) || isGarbageValue(name)) {
        return false;
    }

    return /^[\p{L}\s.'-]+$/u.test(name);
};

const isValidContact = (contact) => {
    if (contact.length < 5 || contact.length > 80) {
        return false;
    }

    const normalized = contact.replace(/\s+/g, '');
    const digits = normalized.replace(/\D/g, '');
    const repeatedDigitsOnly = /^(\d)\1+$/.test(digits);
    const knownJunkContact = /^(test|testing|qwerty|asdf|asdfgh|admin|unknown|none|null|undefined|aaaaaa|123456)$/i;
    const isPhoneLike = digits.length >= 7 && digits.length <= 15 && !repeatedDigitsOnly && /^[+()\d\s-]+$/.test(contact);
    const isTelegramHandle = /^@?[a-zA-Z0-9_]{5,32}$/.test(normalized);
    const isMessengerLink = /^https?:\/\/(t\.me|wa\.me)\/[a-zA-Z0-9_+/-]{5,40}$/i.test(normalized);

    if (knownJunkContact.test(normalized)) {
        return false;
    }

    return isPhoneLike || isTelegramHandle || isMessengerLink;
};

const isTruthyConsent = (value) => ['yes', 'on', 'true', '1'].includes(String(value || '').toLowerCase());

const validateSpam = (data) => {
    const honeypot = toCleanString(data.website || data.company || data.url);

    if (honeypot) {
        return false;
    }

    const startedAt = Number(data.formStartedAt);

    if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < MIN_FORM_FILL_TIME_MS) {
        return false;
    }

    return true;
};

const cleanupRateLimit = (now) => {
    for (const [key, value] of recentRequests.entries()) {
        if (now - value.windowStartedAt > RATE_LIMIT_WINDOW_MS) {
            recentRequests.delete(key);
        }
    }
};

const checkRateLimit = (key) => {
    const now = Date.now();
    cleanupRateLimit(now);

    const current = recentRequests.get(key);

    if (!current) {
        recentRequests.set(key, {
            lastSubmittedAt: now,
            windowStartedAt: now,
            count: 1
        });
        return true;
    }

    if (now - current.lastSubmittedAt < REPEAT_SUBMIT_WINDOW_MS) {
        current.lastSubmittedAt = now;
        current.count += 1;
        return false;
    }

    if (now - current.windowStartedAt <= RATE_LIMIT_WINDOW_MS && current.count >= RATE_LIMIT_MAX_REQUESTS) {
        current.lastSubmittedAt = now;
        current.count += 1;
        return false;
    }

    if (now - current.windowStartedAt > RATE_LIMIT_WINDOW_MS) {
        current.windowStartedAt = now;
        current.count = 0;
    }

    current.lastSubmittedAt = now;
    current.count += 1;
    return true;
};

const validateFields = (data) => {
    const name = toCleanString(data.name);
    const phone = toCleanString(data.phone);
    const age = toCleanString(data.age);
    const format = toCleanString(data.format);
    const message = toCleanString(data.message);

    if ([name, phone, age, format].some((field) => field.length > MAX_FIELD_LENGTH)) {
        return null;
    }

    if (!name || !phone || !age || !format || !isTruthyConsent(data.consent)) {
        return null;
    }

    if (!isValidName(name) || !isValidContact(phone)) {
        return null;
    }

    if (age.length < 1 || age.length > 40 || hasUrl(age) || isGarbageValue(age)) {
        return null;
    }

    if (!allowedFormats.has(format)) {
        return null;
    }

    if (message.length > MAX_MESSAGE_LENGTH || hasRepeatedChars(message)) {
        return null;
    }

    if (message && /https?:\/\/|www\./i.test(message)) {
        return null;
    }

    return {
        name,
        phone,
        age,
        format,
        message: message.slice(0, MAX_MESSAGE_LENGTH)
    };
};

const getClientKey = (event, phone) => {
    const forwardedFor = getHeader(event.headers, 'x-forwarded-for').split(',')[0].trim();
    const ip = forwardedFor || getHeader(event.headers, 'client-ip') || 'unknown-ip';
    const normalizedPhone = phone.toLowerCase().replace(/\s+/g, '');
    return `${ip}:${normalizedPhone}`;
};

exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { ok: false, error: 'method_not_allowed' });
    }

    let data;

    try {
        data = parseBody(event);
    } catch (error) {
        return jsonResponse(error.statusCode || 400, { ok: false, error: 'bad_request' });
    }

    if (!validateSpam(data)) {
        return jsonResponse(400, { ok: false, error: 'bad_request' });
    }

    const validated = validateFields(data);

    if (!validated) {
        return jsonResponse(422, { ok: false, error: 'validation_failed' });
    }

    if (!checkRateLimit(getClientKey(event, validated.phone))) {
        return jsonResponse(429, { ok: false, error: 'too_many_requests' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        return jsonResponse(500, { ok: false, error: 'server_configuration_error' });
    }

    const text = `
🧾 Новая заявка с сайта

👤 Имя: ${validated.name}
📞 Контакт: ${validated.phone}
👶 Возраст ребёнка: ${validated.age}
📌 Формат: ${validated.format}

💬 Ситуация:
${validated.message || 'Не указано'}
    `.trim();

    try {
        const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text
            })
        });

        if (!telegramResponse.ok) {
            return jsonResponse(502, { ok: false, error: 'telegram_api_error' });
        }

        return jsonResponse(200, { ok: true });
    } catch (error) {
        return jsonResponse(502, { ok: false, error: 'telegram_api_error' });
    }
};
