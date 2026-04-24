import { kvGet, kvSet, kvDel, sendTelegram, callClaude } from '../lib/triagem.js';

export default async function handler(req, res) {
    if (req.method === 'GET') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const update = req.body;
        if (!update?.message?.text) return res.status(200).end();

        const chatId = String(update.message.chat.id);
        const userText = update.message.text;

        const conv = await kvGet(`conv:${chatId}`);
        if (!conv) return res.status(200).end();

        conv.messages.push({ role: 'user', content: userText });
        if (conv.messages.length > 20) conv.messages = conv.messages.slice(-20);

        const aiText = await callClaude(conv.lead, conv.messages);
        conv.messages.push({ role: 'assistant', content: aiText });

        const isEnd = aiText.includes('[FIM:REUNIAO]') || aiText.includes('[FIM:QUALIFICADO]');

        const cleanText = aiText
            .replace(/\[FIM:REUNIAO\]/g, '')
            .replace(/\[FIM:QUALIFICADO\]/g, '')
            .replace(/\nRESUMO:[\s\S]*$/, '')
            .trim();

        await sendTelegram(chatId, cleanText);

        if (isEnd) {
            const resultado = aiText.includes('[FIM:REUNIAO]') ? 'reuniao' : 'qualificado';
            const tipo = resultado === 'reuniao' ? '✅ Reunião Marcada' : '📋 Lead Qualificado';
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

            // Sincroniza triagem com o CRM
            const crmUrl   = process.env.CRM_WEBHOOK_URL;
            const crmToken = process.env.CRM_WEBHOOK_TOKEN;
            if (crmUrl && crmToken) {
                const mensagens = conv.messages.map(m => ({
                    de:    m.role === 'assistant' ? 'donna' : 'lead',
                    texto: m.content
                }));

                let leadId = conv.lead_id;

                // Se não temos lead_id, tenta criar o lead agora (fallback caso send.js tenha falhado)
                if (!leadId && conv.lead?.nome && conv.lead?.whatsapp) {
                    try {
                        const createRes = await fetch(`${crmUrl}/api/webhook/leads`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${crmToken}`
                            },
                            body: JSON.stringify({
                                nome:          conv.lead.nome,
                                whatsapp:      conv.lead.whatsapp,
                                escritorio:    conv.lead.escritorio    || null,
                                especialidade: conv.lead.especialidade || null,
                                receita:       conv.lead.receita       || null
                            })
                        });
                        if (createRes.ok) {
                            const createData = await createRes.json();
                            leadId = createData.id || null;
                            console.log('[triage] lead criado no CRM via fallback:', leadId);
                        } else {
                            console.error('[triage] falha ao criar lead no CRM:', createRes.status, await createRes.text());
                        }
                    } catch (err) {
                        console.error('[triage] erro ao criar lead no CRM:', err);
                    }
                }

                // Envia triagem: prefere lead_id, cai para phone se ainda não resolveu
                const triagemPayload = { resultado, resumo, mensagens };
                if (leadId) {
                    triagemPayload.lead_id = leadId;
                } else if (conv.lead?.whatsapp) {
                    triagemPayload.phone = conv.lead.whatsapp;
                }

                if (triagemPayload.lead_id || triagemPayload.phone) {
                    try {
                        await fetch(`${crmUrl}/api/webhook/triagem`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${crmToken}`
                            },
                            body: JSON.stringify(triagemPayload)
                        });
                    } catch (crmErr) {
                        console.error('[triage] CRM triagem webhook error:', crmErr);
                    }
                }
            }

            await kvDel(`conv:${chatId}`);
        } else {
            await kvSet(`conv:${chatId}`, conv);
        }
    } catch (err) {
        console.error('triage error:', err);
    }

    return res.status(200).end();
}
