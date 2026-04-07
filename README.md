# 2api — Multi-account AI Gateway for Capy

A zero-dependency Node.js gateway that wraps Capy's Captain API into OpenAI-compatible endpoints. Manage multiple accounts, track quotas, and route requests intelligently — all from a built-in web dashboard.

> Open **http://localhost:3000** for the dashboard

## Features

- **Web Dashboard** — Add/remove accounts, monitor quotas, view request logs in real-time
- **Auto Clerk Login** — Automated authentication with session refresh
- **Quota Tracking** — Per-account credit monitoring with visual progress bars
- **32+ Models** — Access all Capy-supported models (Claude, GPT, Gemini, Grok, and more)
- **Smart Routing** — Requests auto-route to the highest-quota healthy account
- **Dual Streaming** — SSE streaming (Route B) with poll+fake-stream fallback (Route A)
- **OpenAI Compatible** — Drop-in replacement for any OpenAI SDK or tool
- **Zero Dependencies** — Pure Node.js 18+, no npm install required

## Quick Start

### Single account via environment variables

```bash
CAPY_EMAIL=you@example.com CAPY_PASSWORD=secret CAPY_PROJECT_ID=249a5fef-xxxx node index.mjs
```

### Token-only mode (no Clerk login)

```bash
CAPY_API_TOKEN=capy_xxxx CAPY_PROJECT_ID=249a5fef-xxxx node index.mjs
```

### With npm

```bash
npm start
```

## Multi-account Setup

Edit `accounts.json` (auto-created on first run):

```json
{
  "accounts": [
    {
      "name": "main-account",
      "email": "user@example.com",
      "password": "secret",
      "projectId": "249a5fef-...",
      "enabled": true,
      "weight": 1
    },
    {
      "name": "backup",
      "token": "capy_xxxx",
      "projectId": "...",
      "enabled": true,
      "weight": 1
    }
  ]
}
```

Changes to `accounts.json` are hot-reloaded — no restart needed.

## Usage Examples

### curl

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Streaming

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "stream": true,
    "messages": [{"role": "user", "content": "Write a haiku"}]
  }'
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="YOUR_PROXY_KEY"
)

response = client.chat.completions.create(
    model="claude-opus-4-6",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Node.js (OpenAI SDK)

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'YOUR_PROXY_KEY'
});

const completion = await client.chat.completions.create({
  model: 'gpt-5.2',
  messages: [{ role: 'user', content: 'Hello!' }]
});
console.log(completion.choices[0].message.content);
```

### aider

```bash
aider --openai-api-base http://localhost:3000/v1 --openai-api-key YOUR_PROXY_KEY --model claude-opus-4-6
```

### Continue (VS Code)

```json
{
  "models": [{
    "title": "Capy Gateway",
    "provider": "openai",
    "model": "auto",
    "apiBase": "http://localhost:3000/v1",
    "apiKey": "YOUR_PROXY_KEY"
  }]
}
```

## Dashboard Guide

| Panel | Description |
|-------|-------------|
| **Header** | Gateway status (green/red), total requests, uptime |
| **Accounts** | Card grid showing each account: status, plan, credit bar, request stats |
| **Add Account** | Inline form — email/password or token-only mode |
| **Request Log** | Live log of recent API requests with timing and routing info |
| **Configuration** | Stream mode, default model, API key (click to reveal) |

### Account Status Icons

| Icon | Meaning |
|------|---------|
| 🟢 | Active & healthy |
| 🟡 | Low credits (<20%) |
| 🔴 | Cooling down / error |
| ⚫ | Disabled |
| 🔵 | Logging in |

### Credit Bar Colors

- **Green**: >50% remaining
- **Yellow**: 20–50% remaining
- **Red**: <20% remaining
- **Gray**: Unknown (token-only mode)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CAPY_EMAIL` | — | Single-account email |
| `CAPY_PASSWORD` | — | Single-account password |
| `CAPY_API_TOKEN` | — | Single-account API token |
| `CAPY_PROJECT_ID` | — | Project ID |
| `PORT` | `3000` | Server port |
| `PROXY_API_KEY` | auto-generated | API key for proxy auth |
| `STREAM_MODE` | `auto` | `auto`, `sse`, or `poll` |
| `DEFAULT_MODEL` | `auto` | Default model when none specified |
| `POLL_TIMEOUT` | `120000` | Poll timeout in ms |
| `CAPY_API_BASE` | `https://capy.ai` | Capy API base URL |
| `CLERK_DOMAIN` | `https://clerk.capy.ai` | Clerk auth domain |

## Supported Models

| Provider | Models |
|----------|--------|
| **Anthropic** | claude-opus-4-6, claude-opus-4-6-fast, claude-opus-4-5, claude-sonnet-4-6, claude-sonnet-4-5, claude-haiku-4-5 |
| **OpenAI** | gpt-5.4, gpt-5.4-fast, gpt-5.4-mini, gpt-5.3-codex, gpt-5.3-codex-fast, gpt-5.2-codex, gpt-5.2-codex-fast, gpt-5.2, gpt-5.2-fast, gpt-5.2-pro, gpt-5.1, gpt-5.1-codex, gpt-5.1-codex-max, gpt-5, gpt-5-codex |
| **Google** | gemini-3.1-pro, gemini-3-pro, gemini-3-flash |
| **xAI** | grok-4.1-fast, grok-4 |
| **Zhipu** | glm-5, glm-5-turbo, glm-4.7 |
| **Moonshot** | kimi-k2, kimi-k2.5 |
| **Alibaba** | qwen-3-coder |

Model aliases: `gpt-4` → `gpt-5.2`, `gpt-4o` → `gpt-5.2`, `gpt-3.5-turbo` → `gpt-5.4-mini`, `claude-3-opus` → `claude-opus-4-5`, etc.

## Architecture

```
Client Request → /v1/chat/completions
   │
   ├─ Auth check (proxy API key)
   ├─ Smart Router → pick best account (quota% → weight → LRU)
   ├─ Ensure Clerk session (auto-refresh JWT)
   ├─ Create Capy thread + send message
   ├─ Route B: SSE stream (/api/jam/{id}/stream)
   │   └─ Fallback → Route A: poll + fake-stream
   ├─ Clean response (strip agent artifacts)
   └─ Return OpenAI format
       └─ On error → retry next account (max 2)
```

### Clerk Authentication Flow

1. POST to Clerk Frontend API with email/password
2. Extract session ID and client ID
3. Fetch JWT token from session
4. Auto-refresh before expiry (30s interval)
5. Full re-login if session expires

### Quota Tracking

- tRPC call with Clerk JWT (primary)
- Usage API fallback
- Error-based detection (402/403 = no credits)
- Synced every 5 minutes

### Health System

| Event | Cooldown |
|-------|----------|
| Generic error | 60 seconds |
| Rate limited (429) | 120 seconds |
| No credits (402/403) | 600 seconds |
| Success | Reset cooldown |

## API Endpoints

### OpenAI-Compatible

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/models` | List all available models |
| `POST` | `/v1/chat/completions` | Chat completion (streaming supported) |

### Dashboard API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web dashboard |
| `GET` | `/api/status` | Account status + stats |
| `GET` | `/api/logs` | Recent request logs |
| `POST` | `/api/accounts/add` | Add account |
| `POST` | `/api/accounts/:name/remove` | Remove account |
| `POST` | `/api/accounts/:name/disable` | Disable account |
| `POST` | `/api/accounts/:name/enable` | Enable account |
| `POST` | `/api/accounts/:name/relogin` | Re-login account |
| `GET` | `/health` | Health check |

## Limitations

- Clerk login is experimental — 2FA accounts must use token-only mode
- Quota tracking is best-effort; falls back to error-based detection
- SSE streaming (Route B) is reverse-engineered and may break
- No persistent storage — request logs are in-memory (last 200)
- Thread pool has a 30-minute TTL; long conversations may create new threads

## License

MIT
