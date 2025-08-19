import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';
import { initializePayment, verifyPayment, handleWebhook } from '../controllers/paymentController.js'

const router = express.Router();

const initLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
});

router.post('/paystack/initialize', protect, initLimiter, initializePayment);
router.get('/paystack/verify',  verifyPayment); //add protect later

// Webhook must NOT be behind auth
router.post('/paystack/webhook', handleWebhook);

export default router;
