import fetch from "node-fetch";
import crypto from "crypto";

export const baseUrl =
  process.env.MONNIFY_ENV === "production"
    ? "https://api.monnify.com/api/v1"
    : "https://sandbox.monnify.com/api/v1";

// Get Monnify access token with error handling
export const getMonnifyAuthToken = async () => {
  const key = process.env.MONNIFY_API_KEY;
  const secret = process.env.MONNIFY_API_SECRET;

  if (!key || !secret) {
    throw new Error("Monnify API credentials not configured");
  }

  try {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok || !data.responseBody?.accessToken) {
      console.error("Monnify login failed:", data);
      throw new Error(data.responseMessage || "Failed to authenticate with Monnify");
    }

    console.log("[MONNIFY] Authentication successful");
    return data.responseBody.accessToken;
  } catch (error) {
    console.error("[MONNIFY] Auth error:", error.message);
    throw error;
  }
};

// Verify webhook signature for security
export const verifyMonnifyWebhook = (payload, signature) => {
  const secret = process.env.MONNIFY_API_SECRET;
  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
  
  return hash === signature;
};