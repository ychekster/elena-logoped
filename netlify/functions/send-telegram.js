const MIN_FORM_FILL_TIME_MS = 3000;
const REPEAT_SUBMIT_WINDOW_MS = 15000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_MESSAGE_LENGTH = 700;

const validationMessages = {
    name: '2-40 символов',
    age: 'От 3 до 18 лет',
    phone: 'Телефон или Telegram',
    message: 'До 700 символов',
    format: 'Выберите формат',
    consent: 'Подтвердите согласие на обработку персональных данных'
};

const allowedFormats = new Set([
    'Очная диагностика',
    'Очные занятия',
    'Онлайн-диагностика',
    'Онлайн-консультация для родителей',
    'Ещё не знаю, помогите разобраться'
]);

const recentRequests = new Map();

const redactValue = (value) => {
    const cleanValue = toCleanString(value);

    if (!cleanValue) {
        return '';
    }

    return `[redacted length=${cleanValue.length}]`;
};

const redactRawBody = (event) => {
    const contentType = getHeader(event.headers, 'content-type').split(';')[0].trim().toLowerCase();
    const body = String(event.body || '').slice(0, 2000);

    if (!body) {
        return '';
    }

    try {
        if (contentType === 'application/json' || contentType === '') {
            const parsed = JSON.parse(body);

            ['name', 'phone', 'message'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(parsed, key)) {
                    parsed[key] = redactValue(parsed[key]);
                }
            });

            return JSON.stringify(parsed).slice(0, 1000);
        }

        if (contentType === 'application/x-www-form-urlencoded') {
            const params = new URLSearchParams(body);

            ['name', 'phone', 'message'].forEach((key) => {
                if (params.has(key)) {
                    params.set(key, redactValue(params.get(key)));
                }
            });

            return params.toString().slice(0, 1000);
        }
    } catch (error) {
        return '[unparseable body redacted]';
    }

    return body.slice(0, 1000);
};

const logParsedData = (data) => {
    console.log('send-telegram parsed data', {
        name: redactValue(data.name),
        contact: redactValue(data.phone),
        age: toCleanString(data.age),
        format: toCleanString(data.format),
        consent: data.consent,
        website: data.website ? '[filled]' : '',
        formStartedAt: data.formStartedAt
    });
};

const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
});

const fieldError = (code, field, message) => ({
    ok: false,
    code,
    field,
    message
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
    return name.length >= 2 && name.length <= 40;
};

const isValidContact = (contact) => {
    if (contact.length < 5 || contact.length > 40) {
        return false;
    }

    if (contact.startsWith('@')) {
        return /^@[a-zA-Z0-9_]{3,32}$/.test(contact);
    }

    return /^[+()\d\s-]+$/.test(contact) && contact.replace(/\D/g, '').length >= 5;
};

const isTruthyConsent = (value) => ['yes', 'on', 'true', '1'].includes(String(value || '').toLowerCase());

const getChildAge = (value) => {
    const match = String(value || '').match(/\d+/);

    return match ? Number(match[0]) : null;
};

const validateSpam = (data) => {
    console.log('send-telegram check: spam honeypot');
    const honeypot = toCleanString(data.website || data.company || data.url);

    if (honeypot) {
        console.log('send-telegram rejection: honeypot triggered');
        return false;
    }

    console.log('send-telegram check: spam minimum fill time');
    const startedAt = Number(data.formStartedAt);

    if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < MIN_FORM_FILL_TIME_MS) {
        console.log('send-telegram rejection: too fast submission', {
            elapsedMs: Date.now() - startedAt,
            minMs: MIN_FORM_FILL_TIME_MS
        });
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
    console.log('send-telegram check: rate limit');
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
        console.log('send-telegram rejection: rate limit triggered', {
            reason: 'repeat_submit_window',
            count: current.count
        });
        return false;
    }

    if (now - current.windowStartedAt <= RATE_LIMIT_WINDOW_MS && current.count >= RATE_LIMIT_MAX_REQUESTS) {
        current.lastSubmittedAt = now;
        current.count += 1;
        console.log('send-telegram rejection: rate limit triggered', {
            reason: 'window_max_requests',
            count: current.count
        });
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
    console.log('send-telegram check: field validation');
    const name = toCleanString(data.name);
    const phone = toCleanString(data.phone);
    const ageRaw = toCleanString(data.age);
    const age = getChildAge(ageRaw);
    const format = toCleanString(data.format);
    const message = toCleanString(data.message);

    console.log('send-telegram check: name');
    if (!isValidName(name)) {
        console.log('send-telegram rejection: invalid_name');
        return fieldError('invalid_name', 'name', validationMessages.name);
    }

    console.log('send-telegram check: contact');
    if (!isValidContact(phone)) {
        console.log('send-telegram rejection: invalid_contact');
        return fieldError('invalid_contact', 'phone', validationMessages.phone);
    }

    console.log('send-telegram check: age');
    if (!age || age < 3 || age > 18) {
        console.log('send-telegram rejection: invalid_age');
        return fieldError('invalid_age', 'age', validationMessages.age);
    }

    console.log('send-telegram check: allowed format');
    if (!allowedFormats.has(format)) {
        console.log('send-telegram rejection: invalid_format');
        return fieldError('invalid_format', 'format', validationMessages.format);
    }

    console.log('send-telegram check: message length');
    if (message.length > MAX_MESSAGE_LENGTH) {
        console.log('send-telegram rejection: invalid_message');
        return fieldError('invalid_message', 'message', validationMessages.message);
    }

    console.log('send-telegram check: consent');
    if (!isTruthyConsent(data.consent)) {
        console.log('send-telegram rejection: missing_consent');
        return fieldError('missing_consent', 'consent', validationMessages.consent);
    }

    return {
        ok: true,
        data: {
            name,
            phone,
            age: ageRaw,
            format,
            message: message.slice(0, MAX_MESSAGE_LENGTH)
        }
    };
};

const getClientKey = (event, phone) => {
    const forwardedFor = getHeader(event.headers, 'x-forwarded-for').split(',')[0].trim();
    const ip = forwardedFor || getHeader(event.headers, 'client-ip') || 'unknown-ip';
    const normalizedPhone = phone.toLowerCase().replace(/\s+/g, '');
    return `${ip}:${normalizedPhone}`;
};

exports.handler = async function (event) {
    console.log('send-telegram request start', {
        method: event.httpMethod,
        contentType: getHeader(event.headers, 'content-type'),
        rawBody: redactRawBody(event)
    });

    console.log('send-telegram check: request method');
    if (event.httpMethod !== 'POST') {
        console.log('send-telegram rejection: method_not_allowed', { method: event.httpMethod });
        return jsonResponse(405, { ok: false, code: 'bad_request' });
    }

    let data;

    console.log('send-telegram check: parse body');
    try {
        data = parseBody(event);
    } catch (error) {
        console.error('send-telegram error: body parse failed', {
            message: error.message,
            statusCode: error.statusCode || 400
        });
        return jsonResponse(error.statusCode || 400, { ok: false, code: 'bad_request' });
    }

    logParsedData(data);

    if (!validateSpam(data)) {
        return jsonResponse(400, { ok: false, code: 'spam_rejected' });
    }

    const validationResult = validateFields(data);

    if (!validationResult.ok) {
        return jsonResponse(422, validationResult);
    }

    const validated = validationResult.data;

    if (!checkRateLimit(getClientKey(event, validated.phone))) {
        return jsonResponse(429, { ok: false, code: 'rate_limited' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    console.log('send-telegram check: env variables', {
        hasTelegramBotToken: Boolean(botToken),
        hasTelegramChatId: Boolean(chatId)
    });

    if (!botToken || !chatId) {
        console.error('send-telegram error: missing env variables', {
            hasTelegramBotToken: Boolean(botToken),
            hasTelegramChatId: Boolean(chatId)
        });
        return jsonResponse(500, { ok: false, code: 'server_configuration_error' });
    }

    console.log('send-telegram validation passed: preparing Telegram request');

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
        console.log('send-telegram sending request to Telegram');
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

        console.log('send-telegram Telegram response', { status: telegramResponse.status });

        if (!telegramResponse.ok) {
            console.error('send-telegram error: Telegram API returned non-ok status', {
                status: telegramResponse.status
            });
            return jsonResponse(502, { ok: false, code: 'telegram_api_error' });
        }

        console.log('send-telegram success');
        return jsonResponse(200, { ok: true });
    } catch (error) {
        console.error('send-telegram error: Telegram request failed', {
            message: error.message
        });
        return jsonResponse(502, { ok: false, code: 'telegram_api_error' });
    }
};
