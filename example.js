import fetch from "node-fetch";

const API_KEY = "MK_TEST_RY8TA4TV4L";
const SECRET_KEY = "B8SJ2QVD6SMV17VN0AD15WNHE5659HSQ";
const BASE_URL = "https://sandbox.monnify.com/api/v1";

const getAccessToken = async () => {
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${API_KEY}:${SECRET_KEY}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    if (!res.ok) throw data;

    console.log("Access token:", data.responseBody.accessToken);
  } catch (err) {
    console.error("Login failed:", err);
  }
};

getAccessToken();
