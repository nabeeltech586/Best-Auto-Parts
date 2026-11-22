import crypto from 'crypto';
import type {
  CreateDirectPaymentCollectRequest,
  CreateDirectPaymentCollectResponse,
  CreateDirectPaymentQrRequest,
  CreateDirectPaymentQrResponse,
  CreateStandardCheckoutRequest,
  CreateStandardCheckoutResponse,
  PhonePeConfig,
  PhonePeOAuthTokenResponse,
  PhonePeOrderStatusResponse,
  PhonePePaymentModeConfigV2,
} from './types';

// Endpoints according to official PhonePe v2 Developer Documentation
const URLS = {
  UAT: {
    base: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    auth: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
  },
  PROD: {
    base: 'https://api.phonepe.com/apis/pg',
    auth: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
  },
};

export class PhonePeClient {
  private config: PhonePeConfig;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(customConfig?: Partial<PhonePeConfig>) {
    this.config = {
      enabled: process.env.PHONEPE_ENABLED === 'true' || customConfig?.enabled === true,
      environment: (process.env.PHONEPE_ENV as 'UAT' | 'PROD') || customConfig?.environment || 'UAT',
      clientId: process.env.PHONEPE_CLIENT_ID || customConfig?.clientId || '',
      clientSecret: process.env.PHONEPE_CLIENT_SECRET || customConfig?.clientSecret || '',
      clientVersion: Number(process.env.PHONEPE_CLIENT_VERSION || customConfig?.clientVersion || 1),
      merchantId: process.env.PHONEPE_MERCHANT_ID || customConfig?.merchantId || 'BESTAUTOPARTS',
      webhookUsername: process.env.PHONEPE_WEBHOOK_USERNAME || customConfig?.webhookUsername || '',
      webhookPassword: process.env.PHONEPE_WEBHOOK_PASSWORD || customConfig?.webhookPassword || '',
      baseUrl: process.env.PHONEPE_BASE_URL || customConfig?.baseUrl,
    };
  }

  public isEnabled(): boolean {
    return this.config.enabled && !!this.config.clientId && !!this.config.clientSecret;
  }

  public getMerchantId(): string {
    return this.config.merchantId;
  }

  /**
   * Generates or returns a valid cached OAuth 2.0 access token via client credentials.
   */
  public async getAccessToken(): Promise<string> {
    if (!this.isEnabled()) {
      return 'mock_sandbox_access_token';
    }

    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60000) {
      return this.cachedToken.token;
    }

    const authUrl = this.config.baseUrl
      ? `${this.config.baseUrl}/v1/oauth/token`
      : (this.config.environment === 'PROD' ? URLS.PROD.auth : URLS.UAT.auth);

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      client_version: String(this.config.clientVersion),
      grant_type: 'client_credentials',
    });

    try {
      const res = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`PhonePe OAuth failed (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as PhonePeOAuthTokenResponse;
      this.cachedToken = {
        token: data.access_token,
        expiresAt: now + (data.expires_in || 3600) * 1000,
      };

      return data.access_token;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PhonePeClient] Failed to obtain OAuth token:', message);
      throw err;
    }
  }

  /**
   * Helper to build default headers with Bearer token.
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
    };
  }

  private getBaseUrl(): string {
    if (this.config.baseUrl) return this.config.baseUrl;
    return this.config.environment === 'PROD' ? URLS.PROD.base : URLS.UAT.base;
  }

  /**
   * Standard Checkout (v2) — Hosted Payment Session restricted to UPI only.
   */
  public async createStandardCheckout(
    params: Omit<CreateStandardCheckoutRequest, 'paymentFlow'> & {
      redirectUrl: string;
      message?: string;
    }
  ): Promise<CreateStandardCheckoutResponse> {
    // UPI-only configuration: hides cards, net banking, and non-UPI wallets
    const upiOnlyConfig: PhonePePaymentModeConfigV2 = {
      version: 'V2',
      enabledPaymentModes: [
        {
          type: 'UPI',
          flows: ['INTENT', 'QR', 'COLLECT'],
        },
      ],
    };

    const payload: CreateStandardCheckoutRequest = {
      merchantOrderId: params.merchantOrderId,
      amount: params.amount,
      expireAfter: params.expireAfter || 900, // 15-minute standard expiry
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: params.message || 'Best Auto Parts Order Payment',
        merchantUrls: {
          redirectUrl: params.redirectUrl,
        },
        paymentModeConfig: upiOnlyConfig,
      },
      metaInfo: params.metaInfo,
    };

    if (!this.isEnabled()) {
      // Controlled Sandbox Mock Response
      return {
        orderId: `MOCK_ORD_${params.merchantOrderId}`,
        state: 'PENDING',
        redirectUrl: `https://best-auto-parts-one.vercel.app/pay?order=${encodeURIComponent(params.merchantOrderId)}&mock=true`,
        expireAt: Date.now() + (payload.expireAfter || 900) * 1000,
      };
    }

    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/checkout/v2/pay`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PhonePe createStandardCheckout failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      orderId: data.orderId || data.data?.orderId || params.merchantOrderId,
      state: data.state || data.data?.state || 'PENDING',
      redirectUrl: data.redirectUrl || data.data?.redirectUrl || '',
      expireAt: data.expireAt || data.data?.expireAt,
    };
  }

  /**
   * Direct Dynamic UPI QR (v2) — generates order-specific QR for exact amount.
   */
  public async createDynamicUpiQr(
    params: Omit<CreateDirectPaymentQrRequest, 'paymentInstrument'>
  ): Promise<CreateDirectPaymentQrResponse> {
    const payload: CreateDirectPaymentQrRequest = {
      merchantOrderId: params.merchantOrderId,
      amount: params.amount,
      expireAfter: params.expireAfter || 900, // 15-minute expiry
      paymentInstrument: {
        type: 'UPI_QR',
      },
      metaInfo: params.metaInfo,
    };

    if (!this.isEnabled()) {
      // Mock Sandbox Dynamic QR string (standard NPCI UPI URI)
      const mockUpiUri = `upi://pay?pa=bestautoparts@axisbank&pn=Best%20Auto%20Parts&am=${(params.amount / 100).toFixed(2)}&tr=${params.merchantOrderId}&tn=Order%20${params.merchantOrderId}&cu=INR`;
      return {
        orderId: `MOCK_QR_${params.merchantOrderId}`,
        state: 'PENDING',
        qrData: mockUpiUri,
        expireAt: Date.now() + (payload.expireAfter || 900) * 1000,
      };
    }

    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/payments/v2/pay`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PhonePe createDynamicUpiQr failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      orderId: data.orderId || data.data?.orderId || params.merchantOrderId,
      state: data.state || data.data?.state || 'PENDING',
      qrData: data.qrData || data.data?.qrData || data.data?.instrumentResponse?.qrData,
      expireAt: data.expireAt || data.data?.expireAt,
    };
  }

  /**
   * Direct UPI Collect (v2) — initiates collect request to customer VPA.
   */
  public async createUpiCollect(
    params: { merchantOrderId: string; amount: number; vpa: string; expireAfter?: number }
  ): Promise<CreateDirectPaymentCollectResponse> {
    const payload: CreateDirectPaymentCollectRequest = {
      merchantOrderId: params.merchantOrderId,
      amount: params.amount,
      expireAfter: params.expireAfter || 900,
      paymentInstrument: {
        type: 'UPI_COLLECT',
        vpa: params.vpa,
      },
    };

    if (!this.isEnabled()) {
      return {
        orderId: `MOCK_COLLECT_${params.merchantOrderId}`,
        state: 'PENDING',
        expireAt: Date.now() + (payload.expireAfter || 900) * 1000,
      };
    }

    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/payments/v2/pay`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PhonePe createUpiCollect failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      orderId: data.orderId || data.data?.orderId || params.merchantOrderId,
      state: data.state || data.data?.state || 'PENDING',
      expireAt: data.expireAt || data.data?.expireAt,
    };
  }

  /**
   * Order Status API (v2) — checks terminal state of order on PhonePe gateway.
   */
  public async getOrderStatus(merchantOrderId: string): Promise<PhonePeOrderStatusResponse> {
    if (!this.isEnabled()) {
      return {
        orderId: `MOCK_ORD_${merchantOrderId}`,
        merchantOrderId,
        amount: 69000,
        state: 'PENDING',
      };
    }

    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`PhonePe getOrderStatus failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      orderId: data.orderId || data.data?.orderId,
      merchantOrderId: data.merchantOrderId || data.data?.merchantOrderId || merchantOrderId,
      amount: data.amount || data.data?.amount,
      state: data.state || data.data?.state || 'PENDING',
      responseCode: data.responseCode || data.data?.responseCode,
      paymentInstrument: data.paymentInstrument || data.data?.paymentInstrument,
    };
  }

  /**
   * Webhook Authentication Verification according to PhonePe v2 specifications.
   * PhonePe v2 authenticates callbacks via the username & password configured
   * on the PhonePe merchant portal, passing either:
   * 1. Standard HTTP Basic Auth: `Basic <base64(user:pass)>`
   * 2. SHA256 signature hash: `SHA256(username:password)`
   */
  public verifyWebhookAuth(authHeader: string | null): boolean {
    if (!authHeader) return false;

    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

    // In production, ensure no mock or sandbox payment auth can ever be accepted
    if (isProduction) {
      if (!this.config.webhookUsername || !this.config.webhookPassword) {
        return false;
      }
    } else {
      // Internal reconciliation or test mock bypass (testing / development only)
      if (authHeader === 'MOCK_VALID_AUTH' || authHeader === 'INTERNAL_S2S_RECONCILIATION') {
        return true;
      }

      // In local testing or sandbox mock when credentials are not configured
      if (!this.config.webhookUsername && !this.config.webhookPassword) {
        return authHeader === 'Basic bW9ja191c2VyOm1vY2tfcGFzcw==' || authHeader === 'MOCK_VALID_AUTH';
      }
    }

    const expectedCredentials = `${this.config.webhookUsername}:${this.config.webhookPassword}`;
    const expectedBasic = `Basic ${Buffer.from(expectedCredentials).toString('base64')}`;
    const expectedHash = crypto.createHash('sha256').update(expectedCredentials).digest('hex');

    if (authHeader === expectedBasic) {
      return true;
    }

    // Direct hash comparison
    if (authHeader === expectedHash || authHeader === `Bearer ${expectedHash}`) {
      return true;
    }

    return false;
  }
}

// Global client instance
export const phonePeClient = new PhonePeClient();
