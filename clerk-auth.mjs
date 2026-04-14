import { CLERK_DOMAIN, CLERK_PK } from './config.mjs';

export class ClerkAuth {
  constructor({ clerkDomain = CLERK_DOMAIN } = {}) {
    this.clerkDomain = clerkDomain;
    this.pk = CLERK_PK;
  }

  async startSignIn(email) {
    const url = `${this.clerkDomain}/v1/client/sign_ins?_clerk_js_version=5`;
    const body = new URLSearchParams({ identifier: email });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.pk}`
      },
      body
    });

    const clientJwt = res.headers.get('authorization') || '';
    const data = await res.json();

    if (data.errors) {
      const err = data.errors[0];
      if (err?.code === 'form_identifier_not_found') {
        throw new Error('account_not_found');
      }
      if (err?.code === 'session_exists') {
        return { existing: true, session: this._handleExistingSession(data) };
      }
      throw new Error(err?.message || err?.code || `Clerk sign_in failed (${res.status})`);
    }

    const signIn = data.response || data;

    if (signIn.status === 'complete') {
      return { existing: true, session: this._extractSession(data) };
    }

    const factors = signIn.supported_first_factors || [];
    const emailFactor = factors.find(f => f.strategy === 'email_code');
    if (!emailFactor) {
      throw new Error('email_code strategy not available');
    }

    const prepareUrl = `${this.clerkDomain}/v1/client/sign_ins/${signIn.id}/prepare_first_factor?_clerk_js_version=5`;
    const prepareBody = new URLSearchParams({
      strategy: 'email_code',
      email_address_id: emailFactor.email_address_id
    });

    const prepareRes = await fetch(prepareUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.pk}`,
        'Cookie': `__client=${clientJwt}`
      },
      body: prepareBody
    });

    const prepareClientJwt = prepareRes.headers.get('authorization') || clientJwt;
    const prepareData = await prepareRes.json();

    if (prepareData.errors) {
      const err = prepareData.errors[0];
      throw new Error(err?.message || err?.code || 'Failed to send verification code');
    }

    return {
      existing: false,
      signInId: signIn.id,
      emailAddressId: emailFactor.email_address_id,
      clientJwt: prepareClientJwt
    };
  }

  async verifyOtp(signInId, code, clientJwt) {
    const url = `${this.clerkDomain}/v1/client/sign_ins/${signInId}/attempt_first_factor?_clerk_js_version=5`;
    const body = new URLSearchParams({ strategy: 'email_code', code });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.pk}`,
        'Cookie': `__client=${clientJwt}`
      },
      body
    });

    const data = await res.json();

    if (data.errors) {
      const err = data.errors[0];
      if (err?.code === 'form_code_incorrect') {
        throw new Error('invalid_code');
      }
      if (err?.code === 'verification_expired') {
        throw new Error('code_expired');
      }
      throw new Error(err?.message || err?.code || `OTP verification failed (${res.status})`);
    }

    const signIn = data.response || data;

    if (signIn.status === 'needs_second_factor') {
      throw new Error('needs_second_factor');
    }

    if (signIn.status !== 'complete') {
      throw new Error(`Unexpected status: ${signIn.status}`);
    }

    return this._extractSession(data);
  }

  async resendCode(signInId, emailAddressId, clientJwt) {
    const url = `${this.clerkDomain}/v1/client/sign_ins/${signInId}/prepare_first_factor?_clerk_js_version=5`;
    const body = new URLSearchParams({
      strategy: 'email_code',
      email_address_id: emailAddressId
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${this.pk}`,
        'Cookie': `__client=${clientJwt}`
      },
      body
    });

    const newClientJwt = res.headers.get('authorization') || clientJwt;
    const data = await res.json();

    if (data.errors) {
      const err = data.errors[0];
      throw new Error(err?.message || err?.code || 'Failed to resend code');
    }

    return newClientJwt;
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
      throw new Error('no_session_to_refresh');
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
      throw new Error('session_expired_need_relogin');
    }
  }

  isSessionValid(account) {
    if (!account.session?.jwt) return false;
    if (!account.session.expiresAt) return false;
    return account.session.expiresAt > Date.now() + 60000;
  }
}
