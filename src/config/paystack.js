import dotenv from 'dotenv';
dotenv.config();

export const paystackConfig = {
  secretKey: process.env.PAYSTACK_SECRET_KEY,
  publicKey: process.env.PAYSTACK_PUBLIC_KEY,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:5000',
};

if (!paystackConfig.secretKey) {
  throw new Error('PAYSTACK_SECRET_KEY not set');
}
