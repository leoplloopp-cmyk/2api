import { createServer } from 'node:http';
import { PORT, PROXY_API_KEY, STREAM_MODE, DEFAULT_MODEL, POLL_TIMEOUT, SUPPORTED_MODELS, getModelOwner } from './config.mjs';
import { AccountManager } from './account-manager.mjs';
import { CapyClient } from './capy-client.mjs';
import { StreamClient } from './stream-client.mjs';
import { ThreadPool } from './thread-pool.mjs';
import { buildPrompt, buildSinglePrompt, toOpenAIChatResponse, toOpenAIStreamChunk, toOpenAIStreamStart, mapModel } from './translator.mjs';
import { cleanResponse } from './cleaner.mjs';
import { createFakeStream, startHeartbeat } from './fake-stream.mjs';
import { generateDashboard } from './dashboard.mjs';

const startTime = Date.now();
const capy = new CapyClient();
const streamer = new StreamClient();
const threadPool = new ThreadPool();
let manager;

const requestLog = [];
const MAX_LOG = 200;
let totalRequests = 0;

function addLog(entry) {
  requestLog.unshift(entry);
  if (requestLog.length > MAX_LOG) requestLog.length = MAX_LOG;
  totalRequests++;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function cors(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400'
  });
  res.end();
}

function checkApiAuth(req) {
  const auth = req.headers['authorization'] || '';
  const key = auth.replace(/^Bearer\s+/i, '').trim();
  return key === PROXY_API_KEY;
}

function extractPathParam(url, prefix) {
  const rest = url.slice(prefix.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return [rest, ''];
  return [rest.slice(0, slash), rest.slice(slash)];
}

async function handleChatCompletions(req, res) {
  const start = Date.now();
  const body = await readBody(req);
  const messages = body.messages || [];
  const stream = body.stream === true;
  const requestedModel = mapModel(body.model || DEFAULT_MODEL);

  let account = manager.getBestAccount();
  if (!account) {
    addLog({ timestamp: new Date().toISOString(), method: 'POST', path: '/v1/chat/completions', model: requestedModel, accountName: null, accountQuota: -1, route: null, duration: Date.now() - start, success: false, error: 'no_available_account' });
    return json(res, 503, { error: { message: 'No available accounts', type: 'server_error', code: 'no_accounts' } });
  }

  const excludeNames = [];
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      account = manager.getNextAccount(excludeNames);
      if (!account) break;
    }
    excludeNames.push(account.name);

    try {
      await manager.ensureSession(account);
      const token = manager.getAuthToken(account);
      if (!token) throw new Error('no_token');

      const prompt = buildPrompt(messages, requestedModel);
      const singlePrompt = buildSinglePrompt(messages);

      const threadData = await capy.createThread(token, account.projectId, prompt, requestedModel);
      const threadId = threadData.id;
      const jamId = threadData.jamId || threadData.id;

      let routeUsed = 'A';
      let content = '';

      if (stream) {
        const sseMode = STREAM_MODE === 'poll' ? 'poll' : 'auto';
        let sseSuccess = false;

        if (sseMode !== 'poll') {
          try {
            routeUsed = 'B';
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*'
            });

            const id = `chatcmpl-${Date.now().toString(36)}`;
            const startChunk = toOpenAIStreamStart(requestedModel, id);
            res.write(`data: ${JSON.stringify(startChunk)}\n\n`);

            let fullText = '';
            await streamer.streamResponse(token, jamId,
              (chunk) => {
                fullText += chunk;
                const c = toOpenAIStreamChunk(chunk, requestedModel, id);
                res.write(`data: ${JSON.stringify(c)}\n\n`);
              },
              (text) => {
                const cleaned = cleanResponse(text);
                const finishChunk = toOpenAIStreamChunk(null, requestedModel, id);
                res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
              },
              (err) => {
                throw err;
              }
            );

            sseSuccess = true;
            content = cleanResponse(fullText);
          } catch (e) {
            if (!res.headersSent) {
              routeUsed = 'A';
            } else {
              manager.markError(account, 'stream_error');
              addLog({ timestamp: new Date().toISOString(), method: 'POST', path: '/v1/chat/completions', model: requestedModel, accountName: account.name, accountQuota: account.quota?.percentage ?? -1, route: routeUsed, duration: Date.now() - start, success: false, error: e.message });
              if (!res.writableEnded) res.end();
              return;
            }
          }
        }

        if (!sseSuccess) {
          routeUsed = 'A';
          const heartbeat = !res.headersSent ? null : null;
          const rawContent = await capy.pollForResponse(token, threadId, POLL_TIMEOUT);
          content = cleanResponse(rawContent);

          if (!res.headersSent) {
            createFakeStream(res, content, requestedModel);
          }
        }
      } else {
        routeUsed = 'A';
        const rawContent = await capy.pollForResponse(token, threadId, POLL_TIMEOUT);
        content = cleanResponse(rawContent);
        json(res, 200, toOpenAIChatResponse(content, requestedModel));
      }

      manager.markSuccess(account);
      addLog({ timestamp: new Date().toISOString(), method: 'POST', path: '/v1/chat/completions', model: requestedModel, accountName: account.name, accountQuota: account.quota?.percentage ?? -1, route: routeUsed, duration: Date.now() - start, success: true, error: null });
      return;

    } catch (e) {
      manager.markError(account, e.message);
      console.error(`[gateway] Account ${account.name} failed: ${e.message}`);

      if (attempt === maxRetries) {
        addLog({ timestamp: new Date().toISOString(), method: 'POST', path: '/v1/chat/completions', model: requestedModel, accountName: account.name, accountQuota: account.quota?.percentage ?? -1, route: 'A', duration: Date.now() - start, success: false, error: e.message });
        if (!res.headersSent) {
          json(res, 502, { error: { message: `All accounts failed: ${e.message}`, type: 'server_error', code: 'upstream_error' } });
        }
      }
    }
  }

  if (!res.headersSent) {
    json(res, 503, { error: { message: 'No available accounts for retry', type: 'server_error', code: 'no_accounts' } });
  }
}

function handleModels(req, res) {
  const models = SUPPORTED_MODELS.map(id => ({
    id,
    object: 'model',
    created: 1700000000,
    owned_by: getModelOwner(id)
  }));
  json(res, 200, { object: 'list', data: models });
}

async function handleApiRoute(req, res, url) {
  if (url === '/api/status' && req.method === 'GET') {
    return json(res, 200, {
      accounts: manager.getStatus(),
      stats: { totalRequests },
      uptime: (Date.now() - startTime) / 1000,
      streamMode: STREAM_MODE,
      defaultModel: DEFAULT_MODEL,
      proxyApiKey: PROXY_API_KEY,
      pollTimeout: POLL_TIMEOUT
    });
  }

  if (url === '/api/logs' && req.method === 'GET') {
    return json(res, 200, requestLog.slice(0, 100));
  }

  if (url === '/api/accounts/add' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const name = body.name || `account-${Date.now().toString(36)}`;
      await manager.addAccount({
        name,
        email: body.email,
        password: body.password,
        token: body.token,
        projectId: body.projectId
      });
      return json(res, 200, { ok: true, name });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (url.startsWith('/api/accounts/') && req.method === 'POST') {
    const rest = url.slice('/api/accounts/'.length);
    const parts = rest.split('/');
    const name = decodeURIComponent(parts[0]);
    const action = parts[1];

    try {
      if (action === 'remove') {
        await manager.removeAccount(name);
        return json(res, 200, { ok: true });
      }
      if (action === 'disable') {
        await manager.disableAccount(name);
        return json(res, 200, { ok: true });
      }
      if (action === 'enable') {
        await manager.enableAccount(name);
        return json(res, 200, { ok: true });
      }
      if (action === 'relogin') {
        await manager.reloginAccount(name);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Unknown action' });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  json(res, 404, { error: 'Not found' });
}

const dashboardHtml = generateDashboard();

const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'OPTIONS') return cors(res);

  try {
    if (url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(dashboardHtml);
    }

    if (url === '/health' && req.method === 'GET') {
      return json(res, 200, {
        status: 'ok',
        activeAccounts: manager.getActiveCount(),
        totalAccounts: manager.accounts.length,
        uptime: (Date.now() - startTime) / 1000,
        totalRequests
      });
    }

    if (url.startsWith('/api/')) {
      return await handleApiRoute(req, res, url);
    }

    if (url.startsWith('/v1/')) {
      if (!checkApiAuth(req)) {
        return json(res, 401, { error: { message: 'Invalid API key', type: 'auth_error', code: 'invalid_api_key' } });
      }

      if (url === '/v1/models' && req.method === 'GET') {
        return handleModels(req, res);
      }

      if (url === '/v1/chat/completions' && req.method === 'POST') {
        return await handleChatCompletions(req, res);
      }

      return json(res, 404, { error: { message: 'Not found', type: 'invalid_request_error' } });
    }

    json(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(`[server] Unhandled error: ${e.message}`);
    if (!res.headersSent) {
      json(res, 500, { error: { message: 'Internal server error', type: 'server_error' } });
    }
  }
});

async function main() {
  console.log('========================================');
  console.log('  2api Gateway v1.0.0');
  console.log('========================================');

  manager = new AccountManager();
  await manager.initialize();

  console.log('');

  server.listen(PORT, () => {
    const active = manager.getActiveCount();
    const total = manager.accounts.length;

    console.log(`  Dashboard : http://localhost:${PORT}`);
    console.log(`  API Base  : http://localhost:${PORT}/v1`);
    console.log(`  API Key   : ${PROXY_API_KEY}`);
    console.log(`  Stream    : ${STREAM_MODE} (SSE → poll fallback)`);
    console.log('');
    console.log(`  Active: ${active}/${total} accounts`);
    console.log('========================================');
  });
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
