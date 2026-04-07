import { ClerkAuth } from './clerk-auth.mjs';
import { QuotaTracker } from './quota-tracker.mjs';
import { SmartRouter } from './smart-router.mjs';
import { loadAccounts, saveAccounts, maskEmail } from './config.mjs';
import { watchFile } from 'node:fs';
import { ACCOUNTS_FILE } from './config.mjs';

export class AccountManager {
  constructor() {
    this.accounts = [];
    this.clerk = new ClerkAuth();
    this.quotaTracker = new QuotaTracker();
    this.router = null;
    this._refreshTimer = null;
    this._fileWatcher = null;
  }

  async initialize() {
    const configs = loadAccounts();
    for (const cfg of configs) {
      this._addAccountFromConfig(cfg);
    }

    await this._loginAll();
    this.router = new SmartRouter(this.accounts);
    this._startBackgroundTasks();
    this._watchAccountsFile();

    return this;
  }

  _addAccountFromConfig(cfg) {
    const account = {
      name: cfg.name,
      email: cfg.email || null,
      password: cfg.password || null,
      token: cfg.token || null,
      projectId: cfg.projectId || null,
      enabled: cfg.enabled !== false,
      weight: cfg.weight || 1,
      isTokenOnly: !cfg.email && !!cfg.token,
      status: 'initializing',
      session: null,
      quota: null,
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

  async _loginAll() {
    const promises = this.accounts.map(a => this._loginAccount(a));
    await Promise.allSettled(promises);
  }

  async _loginAccount(account) {
    if (!account.enabled) {
      account.status = 'disabled';
      return;
    }

    if (account.isTokenOnly) {
      account.session = { jwt: account.token, expiresAt: Infinity };
      account.status = 'active';
      account.quota = { creditsUsed: 0, creditsTotal: 0, creditsRemaining: 0, percentage: -1, plan: 'Token-only', lastSynced: new Date().toISOString() };
      console.log(`  ✓ ${account.name} (token-only) — no quota tracking`);
      return;
    }

    account.status = 'logging_in';
    try {
      account.session = await this.clerk.signIn(account.email, account.password);
      account.status = 'active';

      try {
        account.quota = await this.quotaTracker.fetchQuota(account);
      } catch (e) {
        account.quota = { creditsUsed: 0, creditsTotal: 0, creditsRemaining: 0, percentage: -1, plan: 'Unknown', lastSynced: new Date().toISOString() };
      }

      const planStr = account.quota?.plan || 'Unknown';
      const pctStr = account.quota?.percentage >= 0 ? `${account.quota.percentage}% credits` : 'no quota info';
      console.log(`  ✓ ${account.name} (${maskEmail(account.email)}) — ${planStr}, ${pctStr}`);
    } catch (e) {
      account.status = 'auth_failed';
      const reason = e.message === 'needs_second_factor'
        ? 'requires 2FA, use token-only mode'
        : e.message === 'invalid_credentials'
          ? 'invalid credentials'
          : e.message;
      console.log(`  ✗ ${account.name} — login failed: ${reason}`);
    }
  }

  async addAccount({ name, email, password, token, projectId }) {
    const existing = this.accounts.find(a => a.name === name);
    if (existing) throw new Error(`Account '${name}' already exists`);

    const cfg = {
      name,
      email: email || null,
      password: password || null,
      token: token || null,
      projectId: projectId || null,
      enabled: true,
      weight: 1
    };

    const account = this._addAccountFromConfig(cfg);
    await this._loginAccount(account);
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
    if (account.status === 'disabled' || account.status === 'auth_failed') {
      await this._loginAccount(account);
    }
    this._saveToFile();
  }

  async reloginAccount(name) {
    const account = this.accounts.find(a => a.name === name);
    if (!account) throw new Error(`Account '${name}' not found`);
    account.session = null;
    account.status = 'initializing';
    await this._loginAccount(account);
  }

  getBestAccount() {
    return this.router?.getBestAccount() || null;
  }

  getNextAccount(excludeNames) {
    return this.router?.getNextAccount(excludeNames) || null;
  }

  async ensureSession(account) {
    if (account.isTokenOnly) return;

    if (!this.clerk.isSessionValid(account)) {
      try {
        account.session = await this.clerk.refreshSession(account);
      } catch (e) {
        account.status = 'auth_failed';
        throw e;
      }
    }
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
      email: a.email ? maskEmail(a.email) : null,
      isTokenOnly: a.isTokenOnly,
      enabled: a.enabled,
      status: a.status,
      plan: a.quota?.plan || 'Unknown',
      creditsUsed: a.quota?.creditsUsed ?? 0,
      creditsTotal: a.quota?.creditsTotal ?? 0,
      creditsRemaining: a.quota?.creditsRemaining ?? 0,
      percentage: a.quota?.percentage ?? -1,
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

  _startBackgroundTasks() {
    this._refreshTimer = setInterval(async () => {
      for (const account of this.accounts) {
        if (!account.enabled || account.isTokenOnly) continue;
        if (account.status === 'auth_failed') continue;
        try {
          if (!this.clerk.isSessionValid(account)) {
            account.session = await this.clerk.refreshSession(account);
          }
        } catch (e) {
          // silent
        }
      }
    }, 30000);
    this._refreshTimer.unref();

    this.quotaTracker.startPeriodicSync(this.accounts, 300000);
  }

  _watchAccountsFile() {
    try {
      watchFile(ACCOUNTS_FILE, { interval: 5000 }, () => {
        console.log('[account-manager] accounts.json changed, reloading...');
        this._hotReload();
      });
    } catch (e) {
      // silent
    }
  }

  async _hotReload() {
    try {
      const configs = loadAccounts();
      const newNames = new Set(configs.map(c => c.name));
      const oldNames = new Set(this.accounts.map(a => a.name));

      for (const cfg of configs) {
        if (!oldNames.has(cfg.name)) {
          const account = this._addAccountFromConfig(cfg);
          await this._loginAccount(account);
        }
      }

      this.accounts = this.accounts.filter(a => newNames.has(a.name));
      this.router = new SmartRouter(this.accounts);
    } catch (e) {
      console.error(`[account-manager] Hot reload failed: ${e.message}`);
    }
  }

  destroy() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this.quotaTracker.stopPeriodicSync();
  }
}
