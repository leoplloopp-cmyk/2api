import { CAPY_API_BASE } from './config.mjs';

export class CapyClient {
  constructor() {
    this.baseUrl = CAPY_API_BASE;
  }

  async createThread(token, projectId, prompt, model = 'auto') {
    const res = await fetch(`${this.baseUrl}/api/v1/threads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://capy.ai',
        'Referer': 'https://capy.ai/'
      },
      body: JSON.stringify({ projectId, prompt, model })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 402 || res.status === 403) throw new Error('no_credits');
      if (res.status === 429) throw new Error('rate_limited');
      throw new Error(`createThread failed (${res.status}): ${text.slice(0, 200)}`);
    }

    return res.json();
  }

  async sendMessage(token, threadId, message, model = 'auto') {
    const res = await fetch(`${this.baseUrl}/api/v1/threads/${threadId}/message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://capy.ai',
        'Referer': 'https://capy.ai/'
      },
      body: JSON.stringify({ message, model })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 402 || res.status === 403) throw new Error('no_credits');
      if (res.status === 429) throw new Error('rate_limited');
      throw new Error(`sendMessage failed (${res.status}): ${text.slice(0, 200)}`);
    }

    return res.json();
  }

  async listMessages(token, threadId, limit = 50) {
    const res = await fetch(`${this.baseUrl}/api/v1/threads/${threadId}/messages?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Origin': 'https://capy.ai',
        'Referer': 'https://capy.ai/'
      }
    });

    if (!res.ok) {
      throw new Error(`listMessages failed (${res.status})`);
    }

    return res.json();
  }

  async pollForResponse(token, threadId, timeoutMs = 120000) {
    const startTime = Date.now();
    let delay = 300;
    const maxDelay = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const data = await this.listMessages(token, threadId, 5);
      const items = data.items || data.messages || [];

      const assistantMsgs = items.filter(m =>
        m.source === 'assistant' || m.role === 'assistant'
      );

      if (assistantMsgs.length > 0) {
        const latest = assistantMsgs[assistantMsgs.length - 1];
        const content = latest.content || latest.text || '';
        if (content.trim().length > 0) {
          return content;
        }
      }

      await sleep(delay);
      delay = Math.min(delay * 1.5, maxDelay);
    }

    throw new Error('poll_timeout');
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
