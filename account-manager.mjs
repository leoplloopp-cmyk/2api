import { SmartRouter } from './smart-router.mjs';
import { loadAccounts, saveAccounts } from './config.mjs';
import { watchFile } from 'node:fs';
import { ACCOUNTS_FILE } from './config.mjs';

export class AccountManager {
  constructor() {
    this.accounts = [];
    this.router = null;
    this._fileWatcher = null;
  }

  async initialize() {
    const configs = loadAccounts();
    for (const cfg of configs) {
      this._addAccountFromConfig(cfg);
    }

    this._activateAll();
    this.router = new SmartRouter(this.accounts);
    this._watchAccountsFile();

    return this;
  }

  _addAccountFromConfig(cfg) {
    const account = {
      name: cfg.name,
      token: cfg.token || null,
      projectId: cfg.projectId || null,
      enabled: cfg.enabled !== false,
      weight: cfg.weight || 1,
      status: 'initializing',
      session: null,
      health: {
        requestCount: 0,
        errorCount: 0,
        lastUsed: 0,
        cooldownUntil: null,
        noCredits: false,
        noCreditsUntil: null,
        lastError: null
      }
    };
    this.accounts.push(account);
    return account;
  }

  _activateAll() {
    for (const account of this.accounts) {
      if (!account.enabled) {
        account.status = 'disabled';
        continue;
      }
      if (!account.token) {
        account.status = 'auth_failed';
        console.log(`  ✗ ${account.name} — no token configured`);
        continue;
      }
      account.session = { jwt: account.token, expiresAt: Infinity };
      account.status = 'active';
      console.log(`  ✓ ${account.name} (token-only)`);
    }
  }

  async addAccount({ name, token, projectId }) {
    const existing = this.accounts.find(a => a.name === name);
    if (existing) throw new Error(`Account '${name}' already exists`);

    const account = this._addAccountFromConfig({ name, token, projectId, enabled: true, weight: 1 });
    if (account.token) {
      account.session = { jwt: account.token, expiresAt: Infinity };
      account.status = 'active';
    } else {
      account.status = 'auth_failed';
    }
    this.router = new SmartRouter(this.accounts);
    this._saveToFile();
    return account;
  }

  async removeAccount(name) {
    const idx = this.accounts.findIndex(a => a.name === name);
    if (idx === -1) throw new Error(`Account '${name}' not found`);
    this.accounts.splice(idx, 1);
    this.router = new SmartRouter(this.accounts);
    this._saveToFile();
  }

  async disableAccount(name) {
    const account = this.accounts.find(a => a.name === name);
    if (!account) throw new Error(`Account '${name}' not found`);
    account.enabled = false;
    account.status = 'disabled';
    this._saveToFile();
  }

  async enableAccount(name) {
    const account = this.accounts.find(a => a.name === name);
    if (!account) throw new Error(`Account '${name}' not found`);
    account.enabled = true;
    if (account.token) {
      account.session = { jwt: account.token, expiresAt: Infinity };
      account.status = 'active';
    }
    this._saveToFile();
  }

  getBestAccount() {
    return this.router?.getBestAccount() || null;
  }

  getNextAccount(excludeNames) {
    return this.router?.getNextAccount(excludeNames) || null;
  }

  async ensureSession(account) {
    if (!account.token) throw new Error('no_token');
  }

  getAuthToken(account) {
    return account.session?.jwt || account.token || null;
  }

  markSuccess(account) {
    account.health.requestCount++;
    account.health.lastUsed = Date.now();
    account.health.cooldownUntil = null;
    if (account.status !== 'disabled') account.status = 'active';
  }

  markError(account, error) {
    account.health.errorCount++;
    account.health.lastError = error;

    if (error === 'rate_limited') {
      account.health.cooldownUntil = Date.now() + 120000;
      account.status = 'cooling';
    } else if (error === 'no_credits' || error === '402' || error === '403') {
      account.health.noCredits = true;
      account.health.noCreditsUntil = Date.now() + 600000;
      account.health.cooldownUntil = Date.now() + 600000;
      account.status = 'no_credits';
    } else {
      account.health.cooldownUntil = Date.now() + 60000;
      account.status = 'cooling';
    }
  }

  getStatus() {
    return this.accounts.map(a => ({
      name: a.name,
      enabled: a.enabled,
      status: a.status,
      requestCount: a.health.requestCount,
      errorCount: a.health.errorCount,
      lastUsed: a.health.lastUsed ? new Date(a.health.lastUsed).toISOString() : null,
      cooldownUntil: a.health.cooldownUntil ? new Date(a.health.cooldownUntil).toISOString() : null
    }));
  }

  getActiveCount() {
    return this.accounts.filter(a => a.enabled && a.status === 'active').length;
  }

  _saveToFile() {
    try {
      saveAccounts(this.accounts);
    } catch (e) {
      console.error(`[account-manager] Failed to save accounts: ${e.message}`);
    }
  }

  _watchAccountsFile() {
    try {
      watchFile(ACCOUNTS_FILE, { interval: 5000 }, () => {
        console.log('[account-manager] accounts.json changed, reloading...');
        this._hotReload();
      });
    } catch (e) {}
  }

  async _hotReload() {
    try {
      const configs = loadAccounts();
      const newNames = new Set(configs.map(c => c.name));
      const oldNames = new Set(this.accounts.map(a => a.name));

      for (const cfg of configs) {
        if (!oldNames.has(cfg.name)) {
          const account = this._addAccountFromConfig(cfg);
          if (account.token) {
            account.session = { jwt: account.token, expiresAt: Infinity };
            account.status = 'active';
          }
        }
      }

      this.accounts = this.accounts.filter(a => newNames.has(a.name));
      this.router = new SmartRouter(this.accounts);
    } catch (e) {
      console.error(`[account-manager] Hot reload failed: ${e.message}`);
    }
  }

  destroy() {}
}
