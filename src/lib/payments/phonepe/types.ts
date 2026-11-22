/**
 * PhonePe Payment Gateway (v2) Type Definitions & Enums
 *
 * Implements specifications according to official PhonePe Developer Docs (v2):
 * - OAuth 2.0 Client Credentials Authentication (/v1/oauth/token)
 * - Standard Checkout API v2 (/checkout/v2/pay) with paymentModeConfig
 * - Direct Payment Instruments v2 (/payments/v2/pay) for UPI_QR and UPI_COLLECT
 * - Order Status API v2 (/checkout/v2/order/{merchantOrderId}/status)
 * - Webhook callback models and authentication
 */

export type PhonePeEnvironment = 'UAT' | 'PROD';

export interface PhonePeConfig {
  enabled: boolean;
  environment: PhonePeEnvironment;
  clientId: string;
  clientSecret: string;
  clientVersion: number;
  merchantId: string;
  webhookUsername?: string;
  webhookPassword?: string;
  baseUrl?: string;
}

export interface PhonePeOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Payment Mode Config v2 for constraining instruments to UPI only
export interface PhonePePaymentModeConfigV2 {
  version: 'V2';
  enabledPaymentModes: Array<{
    type: 'UPI';
    flows?: Array<'INTENT' | 'COLLECT' | 'QR'>;
    apps?: string[];
    instruments?: Array<'BANK_ACCOUNT' | 'RUPAY_CC' | 'CREDIT_LINE'>;
  }>;
}

export interface CreateStandardCheckoutRequest {
  merchantOrderId: string;
  amount: number; // in paise (e.g. 69000 for ₹690.00)
  expireAfter?: number; // in seconds, default 900 (15 min)
  paymentFlow: {
    type: 'PG_CHECKOUT';
    message?: string;
    merchantUrls: {
      redirectUrl: string;
    };
    paymentModeConfig?: PhonePePaymentModeConfigV2;
  };
  metaInfo?: Record<string, string>;
}

export interface CreateStandardCheckoutResponse {
  orderId: string;
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  redirectUrl: string;
  expireAt?: number;
}

export interface CreateDirectPaymentQrRequest {
  merchantOrderId: string;
  amount: number; // in paise
  expireAfter?: number; // default 900 (15 min)
  paymentInstrument: {
    type: 'UPI_QR';
  };
  metaInfo?: Record<string, string>;
}

export interface CreateDirectPaymentQrResponse {
  orderId: string;
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  qrData?: string; // QR string to render or base64 image
  expireAt?: number;
}

export interface CreateDirectPaymentCollectRequest {
  merchantOrderId: string;
  amount: number; // in paise
  expireAfter?: number;
  paymentInstrument: {
    type: 'UPI_COLLECT';
    vpa: string;
  };
  metaInfo?: Record<string, string>;
}

export interface CreateDirectPaymentCollectResponse {
  orderId: string;
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  expireAt?: number;
}

export interface PhonePeOrderStatusResponse {
  orderId: string;
  merchantOrderId: string;
  amount: number; // in paise
  state: 'COMPLETED' | 'PENDING' | 'FAILED' | 'EXPIRED';
  responseCode?: string;
  paymentInstrument?: {
    type?: string;
    utr?: string;
    bankTransactionId?: string;
    vpa?: string;
  };
}

export interface PhonePeWebhookPayload {
  type: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_PENDING' | 'REFUND_SUCCESS';
  payload: {
    orderId: string;
    merchantOrderId: string;
    amount: number; // in paise
    state: 'COMPLETED' | 'PENDING' | 'FAILED';
    responseCode?: string;
    paymentInstrument?: {
      type?: string;
      utr?: string;
      bankTransactionId?: string;
      vpa?: string;
    };
  };
}
