import { CLERK_DOMAIN, CLERK_PK } from './config.mjs';

export class ClerkAuth {
  constructor({ clerkDomain = CLERK_DOMAIN } = {}) {
    this.clerkDomain = clerkDomain;
    this.pk = CLERK_PK;
  }

  async signIn(email, password) {
    const step1Url = `${this.clerkDomain}/v1/client/sign_ins?_clerk_js_version=5`;
    const step1Body = new URLSearchParams({ identifier: email });

    const step1Res = await fetch(step1Url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.pk}`
      },
      body: step1Body
    });

    const step1Data = await step1Res.json();

    if (step1Data.errors) {
      const err = step1Data.errors[0];
      if (err?.code === 'form_identifier_not_found') {
        throw new Error('invalid_credentials');
      }
      if (err?.code === 'session_exists') {
        return this._handleExistingSession(step1Data);
      }
      throw new Error(err?.message || err?.code || `Clerk sign_in step1 failed (${step1Res.status})`);
    }

    const signInObj = step1Data.response || step1Data;
    const signInId = signInObj.id;

    if (!signInId) {
      throw new Error('No sign_in ID returned from Clerk');
    }

    const status1 = signInObj.status;
    if (status1 === 'complete') {
      return this._extractSession(step1Data);
    }

    const step2Url = `${this.clerkDomain}/v1/client/sign_ins/${signInId}/attempt_first_factor?_clerk_js_version=5`;
    const step2Body = new URLSearchParams({ strategy: 'password', password });

    const step2Res = await fetch(step2Url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.pk}`
      },
      body: step2Body
    });

    const step2Data = await step2Res.json();

    if (step2Data.errors) {
      const err = step2Data.errors[0];
      if (err?.code === 'form_password_incorrect') {
        throw new Error('invalid_credentials');
      }
      throw new Error(err?.message || err?.code || `Clerk sign_in step2 failed (${step2Res.status})`);
    }

    const signIn = step2Data.response || step2Data;
    const status = signIn.status;

    if (status === 'needs_second_factor') {
      throw new Error('needs_second_factor');
    }
    if (status === 'needs_new_password') {
      throw new Error('clerk_status_needs_new_password');
    }

    return this._extractSession(step2Data);
  }

  _extractSession(data) {
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
    const url = `${this.clerkDomain}/v1/client/sessions/${sessionId}/tokens?_clerk_js_version=5`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.pk}`,
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
