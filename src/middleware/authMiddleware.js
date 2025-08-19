import { supabase } from '../config/supabaseClient.js';

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Get user data from users table (including role)
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (dbError || !userData) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = userData; // Now includes role
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Admin-only middleware
export const requireAdmin = async (req, res, next) => {
  try {
    // First run protect middleware
    await new Promise((resolve, reject) => {
      protect(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check if user has admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(403).json({ message: 'Access denied' });
  }
};

// Role-based middleware factory
export const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      // First run protect middleware
      await new Promise((resolve, reject) => {
        protect(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Check if user has required role
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ 
          message: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
        });
      }

      next();
    } catch (error) {
      console.error('Role middleware error:', error);
      res.status(403).json({ message: 'Access denied' });
    }
  };
};