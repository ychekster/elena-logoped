exports.handler = async function (event) {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const data = JSON.parse(event.body || '{}');

        const name = data.name?.trim();
        const phone = data.phone?.trim();
        const age = data.age?.trim();
        const format = data.format?.trim();
        const message = data.message?.trim();

        if (!name || !phone || !age || !format) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Заполнены не все обязательные поля' })
            };
        }

        const text = `
🧾 Новая заявка с сайта

👤 Имя: ${name}
📞 Контакт: ${phone}
👶 Возраст ребёнка: ${age}
📌 Формат: ${format}

💬 Ситуация:
${message || 'Не указано'}
        `.trim();

        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: process.env.TELEGRAM_CHAT_ID,
                    text
                })
            }
        );

        if (!telegramResponse.ok) {
            throw new Error('Telegram API error');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Ошибка отправки заявки' })
        };
    }
};