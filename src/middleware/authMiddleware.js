import jwt from "jsonwebtoken";
import { supabase } from "../config/supabaseClient.js";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "access_secret";

export const protect = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", decoded.id)
      .single();

    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Authentication failed" });
  }
};



// Require admin privilege
export const requireAdmin = (req, res, next) => {
  try {
    // Prefer role from req.user (set by protect)
    const role = req.user?.role;

    if (role === "admin") {
      return next();
    }

    // Fallback: try role from JWT payload if middleware stored it
    if (req.auth && req.auth.role === "admin") {
      return next();
    }

    return res.status(403).json({ message: "Admin access required" });
  } catch (err) {
    console.error("requireAdmin error:", err);
    return res.status(403).json({ message: "Admin access required" });
  }
};
