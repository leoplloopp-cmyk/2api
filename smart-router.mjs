export class SmartRouter {
  constructor(accounts) {
    this.accounts = accounts;
  }

  getBestAccount() {
    const available = this.accounts.filter(a => this._isAvailable(a));
    if (available.length === 0) return null;

    available.sort((a, b) => {
      const aq = a.quota?.percentage ?? -1;
      const bq = b.quota?.percentage ?? -1;

      if (aq >= 0 && bq >= 0 && aq !== bq) return bq - aq;
      if (aq >= 0 && bq < 0) return -1;
      if (bq >= 0 && aq < 0) return 1;

      const aw = a.weight || 1;
      const bw = b.weight || 1;
      if (aw !== bw) return bw - aw;

      const aLast = a.health?.lastUsed || 0;
      const bLast = b.health?.lastUsed || 0;
      return aLast - bLast;
    });

    return available[0];
  }

  getNextAccount(excludeNames = []) {
    const available = this.accounts.filter(a =>
      this._isAvailable(a) && !excludeNames.includes(a.name)
    );
    if (available.length === 0) {
      return this._getEmergencyAccount(excludeNames);
    }

    available.sort((a, b) => {
      const aq = a.quota?.percentage ?? -1;
      const bq = b.quota?.percentage ?? -1;
      if (aq >= 0 && bq >= 0 && aq !== bq) return bq - aq;
      return (a.health?.lastUsed || 0) - (b.health?.lastUsed || 0);
    });

    return available[0];
  }

  _isAvailable(account) {
    if (!account.enabled) return false;
    if (account.status === 'auth_failed') return false;

    const health = account.health;
    if (!health) return true;

    if (health.cooldownUntil && Date.now() < health.cooldownUntil) return false;
    if (health.noCredits && health.noCreditsUntil && Date.now() < health.noCreditsUntil) return false;

    return true;
  }

  _getEmergencyAccount(excludeNames = []) {
    const cooling = this.accounts.filter(a =>
      a.enabled &&
      a.status !== 'auth_failed' &&
      !excludeNames.includes(a.name) &&
      a.health?.cooldownUntil
    );

    if (cooling.length === 0) return null;

    cooling.sort((a, b) => a.health.cooldownUntil - b.health.cooldownUntil);
    return cooling[0];
  }
}
