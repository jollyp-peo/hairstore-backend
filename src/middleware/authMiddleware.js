import jwt from "jsonwebtoken";
import { supabase } from "../config/supabaseClient.js";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "access_secret";

export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Access token required" });

    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);

    const { data: user } = await supabase.from("users").select("*").eq("id", decoded.id).single();

    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "Authentication failed" });
  }
};


//Require admin privilege
export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};