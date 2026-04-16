import { kvGet, kvSet, kvDel, sendTelegram, callClaude } from '../lib/triagem.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const update = req.body;
        if (!update?.message?.text) return res.status(200).end();

        const chatId = String(update.message.chat.id);
        const userText = update.message.text;

        const conv = await kvGet(`conv:${chatId}`);
        if (!conv) return res.status(200).end();

        conv.messages.push({ role: 'user', content: userText });

        const aiText = await callClaude(conv.lead, conv.messages);
        conv.messages.push({ role: 'assistant', content: aiText });

        if (conv.messages.length > 20) conv.messages = conv.messages.slice(-20);

        const isEnd = aiText.includes('[FIM:REUNIAO]') || aiText.includes('[FIM:QUALIFICADO]');

        const cleanText = aiText
            .replace(/\[FIM:REUNIAO\]/g, '')
            .replace(/\[FIM:QUALIFICADO\]/g, '')
            .replace(/\nRESUMO:[\s\S]*$/, '')
            .trim();

        await sendTelegram(chatId, cleanText);

        if (isEnd) {
            const tipo = aiText.includes('[FIM:REUNIAO]') ? '✅ Reunião Marcada' : '📋 Lead Qualificado';
            const resumoMatch = aiText.match(/RESUMO:([\s\S]*)/);
            const resumo = resumoMatch ? resumoMatch[1].trim() : '';

            const groupMsg =
                `${tipo}\n\n` +
                `👤 ${conv.lead.nome}\n` +
                `🏢 ${conv.lead.escritorio}\n` +
                `⚖️ ${conv.lead.especialidade}\n` +
                `💰 ${conv.lead.receita}\n\n` +
                `📊 ${resumo}`;

            await sendTelegram(process.env.TELEGRAM_CHAT_ID, groupMsg);
            await kvDel(`conv:${chatId}`);
        } else {
            await kvSet(`conv:${chatId}`, conv);
        }
    } catch (err) {
        console.error('triage error:', err);
    }

    return res.status(200).end();
}
