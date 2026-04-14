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

export function fromAnthropicMessages(body) {
  const messages = [];
  if (body.system) {
    const sys = typeof body.system === 'string' ? body.system : body.system.map(b => b.text).join('\n');
    messages.push({ role: 'system', content: sys });
  }
  for (const msg of (body.messages || [])) {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    let content;
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    } else {
      content = String(msg.content || '');
    }
    messages.push({ role, content });
  }
  return messages;
}

export function toAnthropicResponse(content, model) {
  const id = `msg_${randomId()}`;
  const inputTokens = 0;
  const outputTokens = content ? content.length : 0;
  return {
    id,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens }
  };
}

export function toAnthropicStreamEvent(type, data, model, id) {
  if (type === 'message_start') {
    return {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    };
  }
  if (type === 'content_block_start') {
    return { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
  }
  if (type === 'content_block_delta') {
    return { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: data } };
  }
  if (type === 'content_block_stop') {
    return { type: 'content_block_stop', index: 0 };
  }
  if (type === 'message_delta') {
    return { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: data } };
  }
  if (type === 'message_stop') {
    return { type: 'message_stop' };
  }
  return { type };
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
