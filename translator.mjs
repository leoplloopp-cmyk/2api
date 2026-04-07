const SYSTEM_INJECTION = `You are a helpful AI assistant. Respond directly to the user's message. Do not create tasks, do not use tools, do not take actions, do not suggest follow-up actions. Just answer the question or fulfill the request with text.`;

export function buildPrompt(messages, model) {
  if (!messages || messages.length === 0) return '';

  const parts = [];
  let hasSystem = false;

  for (const msg of messages) {
    const role = msg.role || 'user';
    const content = extractContent(msg.content);

    if (role === 'system') {
      hasSystem = true;
      parts.push(`[System]\n${content}`);
    } else if (role === 'assistant') {
      parts.push(`[Assistant]\n${content}`);
    } else {
      parts.push(`[User]\n${content}`);
    }
  }

  if (!hasSystem) {
    parts.unshift(`[System]\n${SYSTEM_INJECTION}`);
  }

  return parts.join('\n\n');
}

export function buildSinglePrompt(messages) {
  if (!messages || messages.length === 0) return '';
  const last = messages[messages.length - 1];
  return extractContent(last.content);
}

function extractContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  return String(content || '');
}

export function toOpenAIChatResponse(content, model, stream = false) {
  const id = `chatcmpl-${randomId()}`;
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    return { id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content }, finish_reason: null }] };
  }

  return {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

export function toOpenAIStreamChunk(content, model, id) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: content !== null ? { content } : {},
      finish_reason: content === null ? 'stop' : null
    }]
  };
}

export function toOpenAIStreamStart(model, id) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: { role: 'assistant', content: '' },
      finish_reason: null
    }]
  };
}

function randomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 24; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function mapModel(requestedModel) {
  if (!requestedModel) return 'auto';

  const aliases = {
    'gpt-4': 'gpt-5.2',
    'gpt-4-turbo': 'gpt-5.2-fast',
    'gpt-4o': 'gpt-5.2',
    'gpt-4o-mini': 'gpt-5.4-mini',
    'gpt-3.5-turbo': 'gpt-5.4-mini',
    'claude-3-opus': 'claude-opus-4-5',
    'claude-3.5-sonnet': 'claude-sonnet-4-5',
    'claude-3-haiku': 'claude-haiku-4-5',
    'claude-3-sonnet': 'claude-sonnet-4-5'
  };

  return aliases[requestedModel] || requestedModel;
}
