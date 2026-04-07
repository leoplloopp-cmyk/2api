import { CAPY_API_BASE } from './config.mjs';

export class StreamClient {
  constructor() {
    this.baseUrl = CAPY_API_BASE;
  }

  async streamResponse(token, jamId, onChunk, onDone, onError) {
    const url = `${this.baseUrl}/api/jam/${jamId}/stream?expect=run`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Origin': 'https://capy.ai',
          'Referer': 'https://capy.ai/'
        },
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`SSE connection failed (${res.status})`);
      }

      if (!res.body) {
        throw new Error('No response body for SSE');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            continue;
          }

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);
              const text = this.extractText(parsed);
              if (text) {
                fullText += text;
                onChunk(text);
              }
            } catch (e) {
              if (data !== '[DONE]') {
                const text = this.extractText(data);
                if (text) {
                  fullText += text;
                  onChunk(text);
                }
              }
            }
          }
        }
      }

      clearTimeout(timeout);
      onDone(fullText);
      return fullText;
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') {
        onError(new Error('SSE stream timeout'));
      } else {
        onError(e);
      }
      throw e;
    }
  }

  extractText(data) {
    if (typeof data === 'string') return data;
    if (!data || typeof data !== 'object') return null;

    if (data.type === 'patch' && data.patch) {
      const patch = data.patch;
      if (typeof patch === 'string') return patch;
      if (patch.text) return patch.text;
      if (patch.content) return patch.content;
      if (patch.delta) return patch.delta;
      if (Array.isArray(patch.ops)) {
        return patch.ops
          .filter(op => op.op === 'add' || op.op === 'replace')
          .map(op => op.value || '')
          .join('');
      }
      if (patch.value) return patch.value;
    }

    if (data.text) return data.text;
    if (data.content) return data.content;
    if (data.delta?.content) return data.delta.content;
    if (data.delta?.text) return data.delta.text;
    if (data.choices?.[0]?.delta?.content) return data.choices[0].delta.content;

    return null;
  }
}
