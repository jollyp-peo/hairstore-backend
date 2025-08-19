export function rawBodyBuffer(req, res, buf) {
  if (req.originalUrl.startsWith('/api/payments/paystack/webhook')) {
    req.rawBody = buf.toString('utf8');
  }
}
