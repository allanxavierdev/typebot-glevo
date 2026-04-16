# IA de Triagem no Telegram — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um lead preenche o TypeBot, um bot Telegram inicia automaticamente uma conversa de qualificação conduzida por IA (Claude), tenta marcar uma reunião, e envia o resumo do lead qualificado para o grupo Telegram.

**Architecture:** `api/send.js` recebe dados estruturados do lead, armazena o estado inicial no Vercel KV e dispara a primeira mensagem via Claude. `api/triage.js` recebe cada resposta do lead via Telegram webhook, consulta o estado no KV, chama Claude, e detecta quando a conversa encerrou para notificar o grupo. `lib/triagem.js` centraliza as funções compartilhadas (Claude API, Telegram API, KV).

**Tech Stack:** Vercel Serverless Functions (ESM), Claude API (`claude-sonnet-4-6`) via fetch, Telegram Bot API via fetch, Vercel KV (Upstash Redis REST API) via fetch — sem nenhuma dependência npm nova.

---

## Estrutura de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/triagem.js` | Criar | Funções compartilhadas: Claude API, Telegram API, KV, system prompt |
| `api/triage.js` | Criar | Webhook handler: recebe respostas do lead, conduz conversa |
| `api/send.js` | Modificar | Receber `lead` estruturado + iniciar triagem |
| `index.html` | Modificar | Enviar `lead` estruturado junto com `mensagem` |

---

## Task 1: Criar Vercel KV Store

**Files:**
- Nenhum arquivo alterado — configuração no dashboard Vercel

- [ ] **Step 1: Acessar Storage no Vercel**

Acesse [vercel.com/dashboard](https://vercel.com/dashboard) → seu projeto TypeBot → aba **"Storage"** → clique em **"Create Database"** → selecione **"KV"**.

- [ ] **Step 2: Criar o store**

Dê o nome `triagem-kv`, região `Washington, D.C., USA (iad1)` (ou a mais próxima do seu projeto), clique em **"Create"**.

- [ ] **Step 3: Conectar ao projeto**

Na tela do KV criado, clique em **"Connect Project"** → selecione o projeto TypeBot → **"Connect"**.

Isso adiciona automaticamente as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` ao projeto no Vercel.

---

## Task 2: Adicionar variáveis de ambiente no Vercel

**Files:**
- Nenhum arquivo alterado — configuração no dashboard Vercel

- [ ] **Step 1: Adicionar ANTHROPIC_API_KEY**

No Vercel → projeto → **"Settings"** → **"Environment Variables"** → adicione:

```
Name:  ANTHROPIC_API_KEY
Value: <sua nova chave da Anthropic>
Environments: Production, Preview, Development
```

- [ ] **Step 2: Adicionar TELEGRAM_LEAD_CHAT_ID (temporário para demo)**

Adicione também:

```
Name:  TELEGRAM_LEAD_CHAT_ID
Value: (preencher após Task 3)
```

---

## Task 3: Descobrir TELEGRAM_LEAD_CHAT_ID

**Files:**
- Nenhum arquivo alterado

O `TELEGRAM_LEAD_CHAT_ID` é o ID do chat Telegram de quem vai receber as mensagens da IA no demo (você mesmo ou alguém da Glevo).

- [ ] **Step 1: Enviar uma mensagem para o bot**

No Telegram, abra uma conversa com o seu bot e envie qualquer mensagem (ex: "oi").

- [ ] **Step 2: Buscar o chat_id via getUpdates**

No terminal:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
```

Na resposta JSON, encontre `result[0].message.chat.id`. Esse é o seu `TELEGRAM_LEAD_CHAT_ID`.

- [ ] **Step 3: Salvar no Vercel**

Volte ao Vercel e preencha o valor de `TELEGRAM_LEAD_CHAT_ID` com o número encontrado.

---

## Task 4: Criar `lib/triagem.js`

**Files:**
- Criar: `lib/triagem.js`

- [ ] **Step 1: Criar o arquivo com todas as funções compartilhadas**

Crie `lib/triagem.js` com o seguinte conteúdo:

```javascript
// ── Vercel KV (Upstash Redis REST API) ──────────────────────────────────────

export async function kvGet(key) {
    const res = await fetch(
        `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    const json = await res.json();
    return json.result ? JSON.parse(json.result) : null;
}

export async function kvSet(key, value, ttl = 7200) {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(
        `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}/${encoded}?ex=${ttl}`,
        { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
}

export async function kvDel(key) {
    await fetch(
        `${process.env.KV_REST_API_URL}/del/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
}

// ── Telegram ─────────────────────────────────────────────────────────────────

export async function sendTelegram(chatId, text) {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
    });
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
    return data.content[0].text;
}
```

- [ ] **Step 2: Verificar se o arquivo foi criado corretamente**

```bash
cat lib/triagem.js
```

Esperado: arquivo com as 6 funções exportadas.

- [ ] **Step 3: Commit**

```bash
git add lib/triagem.js
git commit -m "feat: add shared triage utilities (KV, Telegram, Claude)"
```

---

## Task 5: Criar `api/triage.js`

**Files:**
- Criar: `api/triage.js`

- [ ] **Step 1: Criar o webhook handler**

Crie `api/triage.js` com o seguinte conteúdo:

```javascript
import { kvGet, kvSet, kvDel, sendTelegram, callClaude } from '../lib/triagem.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const update = req.body;
    if (!update?.message?.text) return res.status(200).end();

    const chatId = String(update.message.chat.id);
    const userText = update.message.text;

    const conv = await kvGet(`conv:${chatId}`);
    if (!conv) return res.status(200).end();

    conv.messages.push({ role: 'user', content: userText });

    const aiText = await callClaude(conv.lead, conv.messages);
    conv.messages.push({ role: 'assistant', content: aiText });

    const isEnd = aiText.includes('[FIM:REUNIAO]') || aiText.includes('[FIM:QUALIFICADO]');

    const cleanText = aiText
        .replace('[FIM:REUNIAO]', '')
        .replace('[FIM:QUALIFICADO]', '')
        .replace(/\nRESUMO:[\s\S]*$/, '')
        .trim();

    await sendTelegram(chatId, cleanText);

    if (isEnd) {
        const tipo = aiText.includes('[FIM:REUNIAO]') ? '✅ Reunião Marcada' : '📋 Lead Qualificado';
        const resumoMatch = aiText.match(/RESUMO:(.*)/);
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

    return res.status(200).end();
}
```

- [ ] **Step 2: Commit**

```bash
git add api/triage.js
git commit -m "feat: add triage webhook handler"
```

---

## Task 6: Modificar `api/send.js`

**Files:**
- Modificar: `api/send.js`

- [ ] **Step 1: Substituir o conteúdo de `api/send.js`**

Substitua o conteúdo completo por:

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add api/send.js
git commit -m "feat: trigger AI triage on new lead submission"
```

---

## Task 7: Modificar `index.html`

**Files:**
- Modificar: `index.html` — função `submitForm()` (linha ~568)

A função `submitForm()` precisa enviar os dados do lead de forma estruturada junto com a `mensagem`.

- [ ] **Step 1: Localizar a linha do body no fetch dentro de `submitForm()`**

Encontre este trecho em `index.html`:

```javascript
            body: JSON.stringify({ mensagem })
```

- [ ] **Step 2: Substituir por**

```javascript
            body: JSON.stringify({
                mensagem,
                lead: { nome, escritorio, whatsapp, especialidade, receita }
            })
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: send structured lead data to API"
```

---

## Task 8: Deploy no Vercel

**Files:**
- Nenhum arquivo alterado

- [ ] **Step 1: Push para o repositório**

```bash
git push origin main
```

O Vercel faz deploy automático ao receber o push. Aguarde o build completar (acompanhe em vercel.com/dashboard → seu projeto → aba "Deployments").

- [ ] **Step 2: Confirmar que o deploy passou**

No Vercel, o status do último deployment deve estar como **"Ready"**.

---

## Task 9: Registrar webhook do Telegram

**Files:**
- Nenhum arquivo alterado

- [ ] **Step 1: Registrar o webhook**

Substitua `<TOKEN>` e `<SEU_DOMINIO>` e execute:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<SEU_DOMINIO>/api/triage"
```

Exemplo de resposta esperada:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

- [ ] **Step 2: Confirmar o webhook**

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Esperado: `"url": "https://<SEU_DOMINIO>/api/triage"` e `"pending_update_count": 0`.

---

## Task 10: Teste manual

**Files:**
- Nenhum arquivo alterado

- [ ] **Step 1: Abrir dois dispositivos**

- **Dispositivo A:** navegador com o TypeBot aberto
- **Dispositivo B:** Telegram logado com a conta cujo chat_id está em `TELEGRAM_LEAD_CHAT_ID`

- [ ] **Step 2: Preencher o formulário**

No Dispositivo A, preencha o TypeBot com dados reais (ou fictícios para teste) e clique em **ENVIAR**.

- [ ] **Step 3: Verificar o grupo Telegram**

No grupo configurado em `TELEGRAM_CHAT_ID`, deve aparecer a mensagem de novo lead com os dados do formulário (comportamento existente).

- [ ] **Step 4: Verificar a conversa no Dispositivo B**

No Telegram do Dispositivo B, o bot deve enviar uma mensagem de abertura personalizada com o nome e especialidade do lead.

- [ ] **Step 5: Conduzir a conversa**

Responda às perguntas da IA. Após as 3 perguntas de qualificação, o bot tentará marcar uma reunião.

- [ ] **Step 6: Verificar o encerramento**

- Se aceitar reunião: bot confirma e o grupo recebe `✅ Reunião Marcada` + resumo
- Se recusar: bot encerra cordialmente e o grupo recebe `📋 Lead Qualificado` + resumo
