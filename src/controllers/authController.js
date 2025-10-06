import { supabase } from "../config/supabaseClient.js";
import { generateAccessToken, generateRefreshToken } from "../utils/generateToken.js";
import bcrypt from 'bcryptjs'
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Signup
export const signup = async (req, res) => {
  try {
    const { email, password, first_name, last_name, username } = req.body;

    if (!email || !password || !first_name || !last_name || !username) {
      return res.status(400).json({ message: "All fields required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    // Check duplicates
    const { data: existing } = await supabase
      .from("users")
      .select("id,email,username")
      .or(`email.eq.${normalizedEmail},username.eq.${normalizedUsername}`)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ message: "Email or username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        email: normalizedEmail,
        username: normalizedUsername,
        first_name,
        last_name,
        password: hashedPassword,
        role: "user",
      })
      .select("*")
      .single();

    if (error) return res.status(400).json({ message: error.message || "Signup failed" });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save session
    await supabase.from("user_sessions").insert({
      user_id: user.id,
      refresh_token: refreshToken,
      user_agent: req.headers["user-agent"] || null,
      ip_address: req.ip,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
    });

    res.status(201).json({
      message: "Signup successful",
      user,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



// Login with username or email
export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .or(`email.eq.${identifier.toLowerCase()},username.eq.${identifier.toLowerCase()}`)
      .maybeSingle();

    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await supabase.from("user_sessions").insert({
      user_id: user.id,
      refresh_token: refreshToken,
      user_agent: req.headers["user-agent"] || null,
      ip_address: req.ip,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    });

    res.json({
      message: "Login successful",
      user,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};




// refresh token 
export const refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(401).json({ message: "Refresh token required" });

    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);

    // Find session
    const { data: session } = await supabase
      .from("user_sessions")
      .select("id, user_id, refresh_token, expires_at")
      .eq("refresh_token", token)
      .maybeSingle();

    if (!session || new Date(session.expires_at) < new Date()) {
      return res.status(403).json({ message: "Invalid or expired session" });
    }

    // Get user
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", session.user_id)
      .single();

    if (!user) return res.status(403).json({ message: "User not found" });

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Rotate session token
    await supabase.from("user_sessions")
      .update({ refresh_token: newRefreshToken, updated_at: new Date() })
      .eq("id", session.id);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired refresh token" });
  }
};


// logout (secure)
export const logout = async (req, res) => {
  try {
    const refreshToken = req.body.refreshToken || req.headers["x-refresh-token"];

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    // Find user_id linked to this refresh token
    const { data: session } = await supabase
      .from("user_sessions")
      .select("user_id")
      .eq("refresh_token", refreshToken)
      .maybeSingle();

    if (!session) {
      return res.status(404).json({ message: "Session not found or already logged out" });
    }

    await supabase
      .from("user_sessions")
      .delete()
      .eq("user_id", session.user_id)
      .eq("refresh_token", refreshToken);

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Logout failed" });
  }
};





// reset password
// Step 1: Request reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ message: "No account with this email" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + 1000 * 60 * 15); // 15 mins

    await supabase.from("users")
      .update({ reset_token: resetToken, reset_expires: resetExpiry })
      .eq("id", user.id);

    // TODO: send email with link: `${FRONTEND_URL}/reset-password/${resetToken}`
    console.log(`Reset link: ${process.env.FRONTEND_URL}/reset-password/${resetToken}`);

    res.json({ message: "Password reset email sent" });
  } catch (err) {
    console.error("Reset request error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// Step 2: Reset password
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("reset_token", token)
      .maybeSingle();

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    if (new Date(user.reset_expires) < new Date()) {
      return res.status(400).json({ message: "Reset token expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password + clear reset token
    await supabase.from("users")
      .update({
        password: hashedPassword,
        reset_token: null,
        reset_expires: null,
      })
      .eq("id", user.id);

    // Invalidate all sessions
    await supabase.from("user_sessions").delete().eq("user_id", user.id);

    res.json({ message: "Password reset successful. All sessions cleared." });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



export const getAllUsers = (req, res) => {
	console.log("users");
};
