export class ThreadPool {
  constructor() {
    this.threads = new Map();
    this.ttl = 30 * 60 * 1000;
    this._cleanupTimer = setInterval(() => this._cleanup(), 300000);
    this._cleanupTimer.unref();
  }

  getThread(accountName, conversationId) {
    const key = `${accountName}:${conversationId || 'default'}`;
    const entry = this.threads.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttl) {
      this.threads.delete(key);
      return null;
    }
    entry.lastUsed = Date.now();
    return entry.threadId;
  }

  setThread(accountName, conversationId, threadId) {
    const key = `${accountName}:${conversationId || 'default'}`;
    this.threads.set(key, {
      threadId,
      accountName,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });
  }

  removeThread(accountName, conversationId) {
    const key = `${accountName}:${conversationId || 'default'}`;
    this.threads.delete(key);
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.threads) {
      if (now - entry.createdAt > this.ttl) {
        this.threads.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this._cleanupTimer);
    this.threads.clear();
  }
}
