import  Paystack from '@paystack/paystack-sdk';
import crypto from 'crypto';
import { paystackConfig } from '../config/paystack.js';

const paystack = new Paystack(paystackConfig.secretKey);

export const paystackService = {
  // Paystack uses amount in kobo for NGN
  toKobo(amountNaira) {
    return Math.round(Number(amountNaira) * 100);
  },

  async initialize({ email, amountNaira, reference, currency = 'NGN', callback_url, metadata }) {
    const payload = {
      email,
      amount: this.toKobo(amountNaira),
      reference,
      currency,
      callback_url,
      metadata: metadata || {},
    };
    const res = await paystack.transaction.initialize(payload);
    return res; // { status, message, data: { authorization_url, access_code, reference } }
  },

  async verify(reference) {
    const res = await paystack.transaction.verify({ reference });
    console.log("📡 [Service.verify] Checking reference:", reference);
    console.log("📡 [Service.verify] Raw Paystack response:", JSON.stringify(res, null, 2));
    return res; // { status, message, data }
  },

  // Webhook signature check (HMAC SHA512 over raw body using secretKey)
  isValidWebhook(rawBody, headerSignature) {
    if (!headerSignature) return false;
    const computed = crypto
      .createHmac('sha512', paystackConfig.secretKey)
      .update(rawBody, 'utf8')
      .digest('hex');
    return computed === headerSignature;
  },
};
