import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CAPY_API_BASE = process.env.CAPY_API_BASE || 'https://capy.ai';
export const PORT = parseInt(process.env.PORT || '3000', 10);
export const PROXY_API_KEY = process.env.PROXY_API_KEY || generateProxyKey();
export const STREAM_MODE = process.env.STREAM_MODE || 'auto';
export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'auto';
export const POLL_TIMEOUT = parseInt(process.env.POLL_TIMEOUT || '120000', 10);
export const ACCOUNTS_FILE = join(__dirname, 'accounts.json');

function generateProxyKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'sk-capy-';
  for (let i = 0; i < 16; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

export function loadAccounts() {
  if (existsSync(ACCOUNTS_FILE)) {
    try {
      const raw = readFileSync(ACCOUNTS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return data.accounts || [];
    } catch (e) {
      console.error(`[config] Failed to parse accounts.json: ${e.message}`);
      return [];
    }
  }

  const accounts = [];

  if (process.env.CAPY_API_TOKEN && process.env.CAPY_PROJECT_ID) {
    accounts.push({
      name: 'default',
      token: process.env.CAPY_API_TOKEN,
      projectId: process.env.CAPY_PROJECT_ID,
      enabled: true,
      weight: 1
    });
  }

  saveAccounts(accounts);
  return accounts;
}

export function saveAccounts(accounts) {
  const data = { accounts: accounts.map(a => {
    const obj = { name: a.name, enabled: a.enabled !== false, weight: a.weight || 1 };
    if (a.token) obj.token = a.token;
    if (a.projectId) obj.projectId = a.projectId;
    return obj;
  })};
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export const SUPPORTED_MODELS = [
  'auto',
  'claude-opus-4-6', 'claude-opus-4-6-fast', 'claude-opus-4-5',
  'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5',
  'gpt-5.4', 'gpt-5.4-fast', 'gpt-5.4-mini',
  'gpt-5.3-codex', 'gpt-5.3-codex-fast',
  'gpt-5.2-codex', 'gpt-5.2-codex-fast', 'gpt-5.2', 'gpt-5.2-fast', 'gpt-5.2-pro',
  'gpt-5.1', 'gpt-5.1-codex', 'gpt-5.1-codex-max',
  'gpt-5', 'gpt-5-codex',
  'gemini-3.1-pro', 'gemini-3-pro', 'gemini-3-flash',
  'grok-4.1-fast', 'grok-4',
  'glm-5', 'glm-5-turbo', 'glm-4.7',
  'kimi-k2', 'kimi-k2.5',
  'qwen-3-coder'
];

export function getModelOwner(model) {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('grok')) return 'xai';
  if (model.startsWith('glm')) return 'zhipu';
  if (model.startsWith('kimi')) return 'moonshot';
  if (model.startsWith('qwen')) return 'alibaba';
  return 'capy';
}
