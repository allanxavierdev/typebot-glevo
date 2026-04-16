import { kvSet, sendTelegram, callClaude } from '../lib/triagem.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { mensagem, lead } = req.body;

    if (!mensagem) {
        return res.status(400).json({ error: 'Mensagem ausente' });
    }

    const token  = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    try {
        // Envia dados do lead para o grupo (comportamento existente)
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: mensagem,
                parse_mode: 'Markdown'
            })
        });

        // Inicia triagem automática se lead e chat de destino estiverem configurados
        const leadChatId = process.env.TELEGRAM_LEAD_CHAT_ID;
        if (lead && leadChatId) {
            const firstMessage = await callClaude(lead, [
                { role: 'user', content: 'Inicie a conversa de qualificação.' }
            ]);

            await kvSet(`conv:${leadChatId}`, {
                lead,
                messages: [
                    { role: 'user', content: 'Inicie a conversa de qualificação.' },
                    { role: 'assistant', content: firstMessage }
                ]
            });

            await sendTelegram(leadChatId, firstMessage);
        }

        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('Erro:', e);
        return res.status(500).json({ error: 'Erro ao processar lead' });
    }
}
