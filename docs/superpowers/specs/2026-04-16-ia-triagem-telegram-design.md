# Design: IA de Triagem no Telegram

**Data:** 2026-04-16  
**Status:** Aprovado  
**Objetivo:** MVP para demonstrar ao cliente que a triagem automática via IA funciona, usando Telegram como canal.

---

## Contexto

O TypeBot da Glevo coleta leads de advogados (nome, escritório, WhatsApp, especialidade, receita mensal) e envia os dados para um grupo do Telegram via `api/send.js`. O próximo passo é que uma IA entre automaticamente em contato com o lead para conduzir uma conversa de qualificação, tentar agendar uma reunião, e — caso não consiga — repassar o lead qualificado para um humano.

Para o MVP, o canal de contato será **Telegram** (em vez de WhatsApp), permitindo validar o conceito hoje.

---

## Fluxo Completo

```
TypeBot preenchido pelo lead
        ↓
api/send.js envia dados para o grupo Telegram (já funciona)
        ↓
api/send.js dispara o bot para iniciar conversa com o lead no Telegram
        ↓
Bot conduz qualificação via Claude API (3 perguntas)
        ↓
   Conseguiu marcar reunião?
   ├── Sim → Confirma data/hora e notifica o grupo Telegram
   └── Não → Envia resumo qualificado para o grupo Telegram
```

---

## Componentes

### 1. `api/triage.js` (novo)

Serverless function (Vercel) que:
- Recebe webhooks do Telegram (mensagens enviadas pelo lead)
- Mantém histórico de conversa em memória por `chat_id`
- Chama a Claude API (`claude-sonnet-4-6`) com o contexto completo
- Envia a resposta gerada de volta ao lead via Telegram Bot API

**Entradas:**
- Webhook POST do Telegram com `message.chat.id` e `message.text`

**Saídas:**
- Mensagem enviada ao lead via `sendMessage` do Telegram
- Notificação final enviada ao grupo (resumo ou confirmação de reunião)

### 2. Modificação em `api/send.js`

Após enviar o lead para o grupo, também chama o bot para iniciar a conversa de qualificação com o lead (via `sendMessage` para o `chat_id` do lead de teste).

### 3. Webhook do Telegram

Configurar o webhook do bot apontando para:
```
https://<dominio-vercel>/api/triage
```

---

## Conversa de Qualificação

A IA usa os dados do formulário como contexto inicial e conduz a seguinte sequência:

1. **Abertura personalizada** — "Oi [nome], sou a assistente da Glevo! Vi que você atua em [especialidade]. Tenho algumas perguntas rápidas..."
2. **Pergunta 1 — Dor atual:** "Qual é o seu maior desafio hoje na gestão do escritório?"
3. **Pergunta 2 — Solução atual:** "Você já usa algum sistema ou ferramenta para isso?"
4. **Pergunta 3 — Urgência:** "Você está buscando resolver isso nos próximos 30 dias?"
5. **Tentativa de agendamento:** Propõe uma reunião com a equipe Glevo.
   - Se aceitar → confirma e notifica o grupo
   - Se recusar → agradece e envia resumo qualificado para o grupo

**Tom:** Profissional, direto, amigável. Sem ser robótico.

---

## Prompt do Sistema (Claude)

```
Você é uma assistente de vendas da Glevo, uma empresa que ajuda escritórios de advocacia a crescerem.
Seu objetivo é qualificar leads de forma natural e amigável, e tentar agendar uma reunião com a equipe.

Dados do lead:
- Nome: {nome}
- Escritório: {escritorio}
- Especialidade: {especialidade}
- Receita mensal: {receita}

Conduza a conversa em português brasileiro, de forma natural. Faça uma pergunta por vez.
Após obter as respostas das 3 perguntas de qualificação, tente marcar uma reunião.
Se o lead não quiser agendar, encerre cordialmente e indique que um consultor entrará em contato.
Quando a conversa encerrar, envie uma mensagem especial começando com [RESUMO] contendo todos os dados coletados.
```

---

## Variáveis de Ambiente Necessárias

| Variável | Descrição | Já existe? |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram | Sim |
| `TELEGRAM_CHAT_ID` | ID do grupo que recebe leads | Sim |
| `ANTHROPIC_API_KEY` | Chave da API Claude | Novo |
| `TELEGRAM_LEAD_CHAT_ID` | Chat ID do lead de teste para o demo | Novo (demo) |

---

## Stack Técnica

- **Runtime:** Vercel Serverless Functions (Node.js) — igual ao existente
- **IA:** Claude API (`claude-sonnet-4-6`) via `@anthropic-ai/sdk`
- **Mensageria:** Telegram Bot API (já em uso)
- **Sem banco de dados:** histórico de conversa em memória (`Map` por `chat_id`) — suficiente para o MVP

---

## Limitações do MVP

- Histórico de conversa em memória: reiniciado se a função reiniciar (aceitável para demo)
- O "lead" no demo é um chat de teste no Telegram (não o WhatsApp real do cliente)
- Sem agendamento real (o bot propõe, o humano confirma via Telegram)

---

## Fora do Escopo (por ora)

- Integração com WhatsApp Business API
- Persistência do histórico em banco de dados
- Agendamento automático via Calendly ou similar
- Painel de leads qualificados
