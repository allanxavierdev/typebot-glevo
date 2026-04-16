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
    return `Você é uma assistente de vendas da Glevo, empresa que ajuda escritórios de advocacia a crescerem com tecnologia.
Seu objetivo: qualificar o lead de forma natural e amigável, e tentar agendar uma reunião com a equipe Glevo.

Dados já coletados no formulário:
- Nome: ${lead.nome}
- Escritório: ${lead.escritorio}
- Especialidade: ${lead.especialidade}
- Receita mensal: ${lead.receita}

Regras:
- Português brasileiro, tom profissional e amigável
- Faça UMA pergunta por vez
- Não mencione que é uma IA
- Sequência obrigatória:
  1. Apresente-se brevemente e pergunte sobre o maior desafio na gestão do escritório
  2. Pergunte se já usa algum sistema ou ferramenta
  3. Pergunte se está buscando resolver isso nos próximos 30 dias
  4. Tente marcar uma reunião com a equipe Glevo
- Se o lead aceitar reunião: confirme e diga que a equipe enviará o link em breve. Inclua ao final da mensagem: [FIM:REUNIAO]
- Se o lead recusar reunião ou encerrar: agradeça e diga que um consultor entrará em contato. Inclua ao final da mensagem: [FIM:QUALIFICADO]
- Quando incluir [FIM:*], adicione na linha seguinte: RESUMO: <dor> | <sistema atual> | <urgência> | <decisão>`;
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
