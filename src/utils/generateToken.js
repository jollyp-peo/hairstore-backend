import jwt from "jsonwebtoken";
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES = "7d";

// Generate tokens
export const generateAccessToken = (user) => {
  return jwt.sign({ id: user.id, role: user.role }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  });
};

export const generateRefreshToken = (user) => {
  return jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_EXPIRES,
  });
};



