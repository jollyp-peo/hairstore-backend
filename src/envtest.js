import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function testFlutterwaveKey() {
  try {
    console.log("🔍 Using FLW_SECRET_KEY:", process.env.FLW_SECRET_KEY);

    const body = {
      tx_ref: `tx-${Date.now()}`,
      amount: 100,
      currency: "NGN",
      redirect_url: "http://localhost:3000/payment/callback",
      customer: {
        email: "test@example.com",
        phonenumber: "08012345678",
        name: "Test User"
      },
      customizations: {
        title: "Test Payment",
        description: "Testing Flutterwave sandbox payment",
        logo: "https://via.placeholder.com/150"
      }
    };

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      body,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json",
        }
      }
    );

    console.log("✅ Payment initialized successfully!");
    console.log(response.data);
  } catch (error) {
    if (error.response) {
      console.error("❌ Error response:", error.response.data);
    } else {
      console.error("❌ Error:", error.message);
    }
  }
}

testFlutterwaveKey();