import { CAPY_API_BASE } from './config.mjs';

export class QuotaTracker {
  constructor() {
    this._timers = [];
  }

  async fetchQuota(account) {
    if (!account.session?.jwt) {
      return this._unknownQuota();
    }

    try {
      return await this._fetchViaTrpc(account);
    } catch (e) {
      try {
        return await this._fetchViaApi(account);
      } catch (e2) {
        return this._unknownQuota();
      }
    }
  }

  async _fetchViaTrpc(account) {
    const url = `${CAPY_API_BASE}/api/trpc/user.getUsage?input=${encodeURIComponent(JSON.stringify({}))}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${account.session.jwt}`,
        'Cookie': `__session=${account.session.jwt}`,
        'Accept': 'application/json',
        'Referer': 'https://capy.ai/'
      }
    });

    if (!res.ok) throw new Error(`tRPC ${res.status}`);

    const data = await res.json();
    const result = data?.result?.data;
    if (!result) throw new Error('No usage data');

    const creditsUsed = result.creditsUsed ?? result.used ?? 0;
    const creditsTotal = result.creditsTotal ?? result.total ?? result.limit ?? 1000;
    const creditsRemaining = creditsTotal - creditsUsed;
    const plan = result.plan || result.tier || 'Unknown';

    return {
      creditsUsed,
      creditsTotal,
      creditsRemaining,
      percentage: Math.round((creditsRemaining / creditsTotal) * 100),
      plan,
      lastSynced: new Date().toISOString()
    };
  }

  async _fetchViaApi(account) {
    const url = `${CAPY_API_BASE}/api/v1/usage`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${account.session.jwt}`,
        'Accept': 'application/json',
        'Referer': 'https://capy.ai/'
      }
    });

    if (!res.ok) throw new Error(`Usage API ${res.status}`);

    const data = await res.json();
    const creditsUsed = data.used ?? data.creditsUsed ?? 0;
    const creditsTotal = data.total ?? data.creditsTotal ?? data.limit ?? 1000;

    return {
      creditsUsed,
      creditsTotal,
      creditsRemaining: creditsTotal - creditsUsed,
      percentage: Math.round(((creditsTotal - creditsUsed) / creditsTotal) * 100),
      plan: data.plan || data.tier || 'Unknown',
      lastSynced: new Date().toISOString()
    };
  }

  _unknownQuota() {
    return {
      creditsUsed: 0,
      creditsTotal: 0,
      creditsRemaining: 0,
      percentage: -1,
      plan: 'Unknown',
      lastSynced: new Date().toISOString()
    };
  }

  startPeriodicSync(accounts, intervalMs = 300000) {
    const timer = setInterval(async () => {
      for (const account of accounts) {
        if (!account.enabled || !account.session?.jwt) continue;
        try {
          account.quota = await this.fetchQuota(account);
        } catch (e) {
          // silent
        }
      }
    }, intervalMs);
    timer.unref();
    this._timers.push(timer);
  }

  stopPeriodicSync() {
    this._timers.forEach(t => clearInterval(t));
    this._timers = [];
  }
}
