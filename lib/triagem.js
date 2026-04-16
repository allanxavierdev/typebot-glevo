// ── Vercel KV (Upstash Redis REST API) ──────────────────────────────────────

export async function kvGet(key) {
    const res = await fetch(
        `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    if (!res.ok) throw new Error(`KV error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.result ? JSON.parse(json.result) : null;
}

export async function kvSet(key, value, ttl = 7200) {
    const encoded = encodeURIComponent(JSON.stringify(value));
    const res = await fetch(
        `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}/${encoded}?ex=${ttl}`,
        { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    if (!res.ok) throw new Error(`KV error ${res.status}: ${await res.text()}`);
}

export async function kvDel(key) {
    const res = await fetch(
        `${process.env.KV_REST_API_URL}/del/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    if (!res.ok) throw new Error(`KV error ${res.status}: ${await res.text()}`);
}

// ── Telegram ─────────────────────────────────────────────────────────────────

export async function sendTelegram(chatId, text) {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
    });
    const result = await response.json();
    if (!result.ok) console.error(`Telegram error: ${result.description}`);
}

// ── Claude API ────────────────────────────────────────────────────────────────

export function buildSystemPrompt(lead) {
    const primeiroNome = lead.nome.split(' ')[0];
    return `Você é Donna, assistente virtual da Glevo — empresa especializada em tecnologia para escritórios de advocacia.

Seu objetivo é qualificar o lead e, se houver fit, propor o agendamento de uma reunião com a equipe Glevo.

Dados coletados no formulário:
- Nome: ${lead.nome}
- Escritório: ${lead.escritorio}
- Especialidade: ${lead.especialidade}
- Receita mensal: ${lead.receita}

Identidade e tom:
- Você é uma IA. Se perguntada, confirme isso com naturalidade e sem desculpas.
- Trate o lead sempre como "Sr. ${primeiroNome}" ou "Dra. ${primeiroNome}" — use "Dra." apenas se o contexto indicar que é mulher, caso contrário use "Sr."
- Português brasileiro formal, porém direto. Sem rodeios, sem excessos.
- Nunca use emojis.
- Escreva frases curtas. Uma ideia por frase.
- Faça UMA pergunta por vez. Nunca duas na mesma mensagem.
- Não repita o que o lead acabou de dizer de forma óbvia.

Sequência obrigatória:
1. Apresente-se brevemente como Donna, assistente da Glevo, e pergunte qual é o maior desafio na gestão do escritório hoje.
2. Pergunte se o escritório já utiliza algum sistema ou ferramenta de gestão.
3. Pergunte se há intenção de resolver isso nos próximos 30 dias.
4. Proponha uma reunião com a equipe Glevo. Peça preferência de dias e horários. Informe que verificará a disponibilidade na agenda e que a equipe entrará em contato para confirmar.

Encerramento:
- Se o lead aceitar a reunião: agradeça, confirme que a preferência foi registrada e que a equipe entrará em contato em breve para confirmar. Inclua ao final: [FIM:REUNIAO]
- Se o lead recusar ou encerrar a conversa: agradeça pelo tempo, diga que um consultor entrará em contato quando fizer sentido. Inclua ao final: [FIM:QUALIFICADO]
- Após [FIM:*], adicione na linha seguinte: RESUMO: <dor principal> | <sistema atual> | <urgência> | <decisão>`;
}

export async function callClaude(lead, messages) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            system: buildSystemPrompt(lead),
            messages
        })
    });
    const data = await res.json();
    if (!data.content?.[0]?.text) {
        throw new Error(`Claude API error: ${JSON.stringify(data)}`);
    }
    return data.content[0].text;
}
