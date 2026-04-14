import { CLERK_DOMAIN, CLERK_PK } from './config.mjs';

export class ClerkAuth {
  constructor({ clerkDomain = CLERK_DOMAIN } = {}) {
    this.clerkDomain = clerkDomain;
    this.pk = CLERK_PK;
  }

  async signIn(email, password) {
    const url = `${this.clerkDomain}/v1/client/sign_ins?_clerk_js_version=5&__clerk_api_key=${this.pk}`;
    const body = new URLSearchParams({ identifier: email, password, strategy: 'password' });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://capy.ai/'
      },
      body
    });

    const data = await res.json();

    if (!res.ok || data.errors) {
      const err = data.errors?.[0];
      if (err?.code === 'form_password_incorrect' || err?.code === 'form_identifier_not_found') {
        throw new Error('invalid_credentials');
      }
      if (err?.code === 'session_exists') {
        return this._handleExistingSession(data);
      }
      throw new Error(err?.message || err?.code || `Clerk sign_in failed (${res.status})`);
    }

    const signIn = data.response || data;
    const status = signIn.status;

    if (status === 'needs_second_factor') {
      throw new Error('needs_second_factor');
    }
    if (status === 'needs_first_factor') {
      throw new Error('needs_first_factor');
    }
    if (status === 'needs_identifier' || status === 'needs_new_password') {
      throw new Error(`clerk_status_${status}`);
    }

    const clientData = data.client || data.response?.client;
    if (!clientData) {
      throw new Error('No client data in Clerk response');
    }

    const session = clientData.sessions?.[0];
    if (!session) {
      throw new Error('No session in Clerk response');
    }

    const jwt = session.last_active_token?.jwt || null;
    const expiresAt = session.expire_at
      ? new Date(session.expire_at).getTime()
      : Date.now() + 3600000;

    return {
      sessionId: session.id,
      sessionToken: clientData.id || session.id,
      jwt,
      expiresAt,
      userId: session.user?.id
    };
  }

  _handleExistingSession(data) {
    const clientData = data.client;
    const session = clientData?.sessions?.[0];
    if (!session) throw new Error('session_exists but no session data');

    return {
      sessionId: session.id,
      sessionToken: clientData.id || session.id,
      jwt: session.last_active_token?.jwt || null,
      expiresAt: session.expire_at
        ? new Date(session.expire_at).getTime()
        : Date.now() + 3600000,
      userId: session.user?.id
    };
  }

  async getSessionToken(clientId, sessionId) {
    const url = `${this.clerkDomain}/v1/client/sessions/${sessionId}/tokens?_clerk_js_version=5&__clerk_api_key=${this.pk}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://capy.ai/',
        'Cookie': `__client=${clientId}`
      }
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed (${res.status})`);
    }

    const data = await res.json();
    const jwt = data.jwt || data.response?.jwt;
    if (!jwt) throw new Error('No JWT in token response');

    return jwt;
  }

  async refreshSession(account) {
    if (!account.session?.sessionId) {
      return this.signIn(account.email, account.password);
    }

    try {
      const jwt = await this.getSessionToken(
        account.session.sessionToken,
        account.session.sessionId
      );
      account.session.jwt = jwt;
      account.session.expiresAt = Date.now() + 3600000;
      return account.session;
    } catch (e) {
      console.log(`[clerk] Token refresh failed for ${account.name}, re-logging in...`);
      return this.signIn(account.email, account.password);
    }
  }

  isSessionValid(account) {
    if (!account.session?.jwt) return false;
    if (!account.session.expiresAt) return false;
    return account.session.expiresAt > Date.now() + 60000;
  }
}
