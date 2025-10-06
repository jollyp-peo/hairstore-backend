import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';
import { initializePayment, verifyPayment, handleWebhook } from '../controllers/paymentController.js';

const router = express.Router();

// Limit payment initialization requests
const initLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
});

// Initialize payment (user must be authenticated)
router.post('/init', protect, initLimiter, initializePayment);

// Verify payment (user must be authenticated)
router.get('/verify', protect, verifyPayment);
// router.get('/verify', verifyPayment);

// Monnify Webhook (must NOT be behind auth)
router.post('/webhook', handleWebhook);

export default router;