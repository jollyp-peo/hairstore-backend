import express from 'express';
import { signup, login, refreshAccessToken, googleOAuthCallback, getAllUsers } from '../controllers/authController.js';
import { protect, requireAdmin, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/refresh', refreshAccessToken);

// Google OAuth callback endpoint
router.post('/google/callback', googleOAuthCallback);

// Protected route
router.get('/profile', protect, (req, res) => {
  res.json({ user: req.user });
});

// Admin only
router.get('/admin/users', requireAdmin, getAllUsers);

export default router;
