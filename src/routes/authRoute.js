import express from 'express';
import {
  signup,
  login,
  refreshToken,
  logout,
  requestPasswordReset,
  resetPassword,
  getAllUsers,
  getMe,
  getCSRFToken
} from '../controllers/authController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';
import { authLimiter } from "../middleware/rateLimiter.js";
import { csrfProtection}  from '../middleware/csrfMiddleware.js';

const router = express.Router();

// Auth
router.post('/signup', authLimiter, csrfProtection, signup);
router.post('/login', authLimiter, csrfProtection, login);
router.post('/refresh', csrfProtection, refreshToken);  
router.post('/logout',csrfProtection,  logout);        
router.get("/me", protect, getMe); 
router.get("/csrf-token", csrfProtection, getCSRFToken); 


// Password reset
router.post('/password-reset/request', requestPasswordReset);
router.post('/password-reset/confirm', resetPassword);

// Admin only
router.get('/admin/users', protect, requireAdmin, getAllUsers);

export default router;
