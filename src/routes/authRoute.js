import express from 'express';
import {
  signup,
  login,
  refreshToken,
  logout,
  requestPasswordReset,
  resetPassword,
  getAllUsers
} from '../controllers/authController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Auth
router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh', refreshToken);   // refresh with token in body
router.post('/logout', logout);          // expects { refreshToken } in body

// Password reset
router.post('/password-reset/request', requestPasswordReset);
router.post('/password-reset/confirm', resetPassword);

// Admin only
router.get('/admin/users', protect, requireAdmin, getAllUsers);

export default router;
