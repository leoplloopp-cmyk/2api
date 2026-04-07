import { toOpenAIStreamChunk, toOpenAIStreamStart } from './translator.mjs';

export function createFakeStream(res, content, model) {
  const id = `chatcmpl-${randomId()}`;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const startChunk = toOpenAIStreamStart(model, id);
  res.write(`data: ${JSON.stringify(startChunk)}\n\n`);

  const words = content.split(/(\s+)/);
  let idx = 0;
  const chunkSize = 3 + Math.floor(Math.random() * 3);

  const interval = setInterval(() => {
    if (idx >= words.length) {
      const finishChunk = toOpenAIStreamChunk(null, model, id);
      res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      clearInterval(interval);
      return;
    }

    const slice = words.slice(idx, idx + chunkSize).join('');
    idx += chunkSize;

    const chunk = toOpenAIStreamChunk(slice, model, id);
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }, 15 + Math.floor(Math.random() * 15));

  return { id, interval };
}

export function startHeartbeat(res) {
  const timer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(timer);
    }
  }, 3000);
  timer.unref();
  return timer;
}

function randomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 24; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
