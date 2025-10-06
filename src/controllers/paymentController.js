import { supabase } from "../config/supabaseClient.js";
import { generateReference, processPayment } from "../utils/paymentUtility.js";
import { getMonnifyAuthToken, baseUrl, verifyMonnifyWebhook } from "../utils/monnifyService.js";
import fetch from "node-fetch";

// Initialize payment
export const initializePayment = async (req, res) => {
  try {
    const user = req.user;
    const { amount, email, cart, meta } = req.body;
    
    if (!amount || !email) {
      return res.status(400).json({ 
        success: false, 
        message: "Amount and email required" 
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid amount" 
      });
    }

    const reference = generateReference();

    // Store payment in DB as initialized
    const { error: insertErr } = await supabase.from("payments").insert({
      user_id: user.id,
      reference,
      amount: amount,
      currency: "NGN",
      status: "initialized",
      cart,
      meta,
      gateway: "monnify",
    });
    
    if (insertErr) {
      console.error("[INIT] DB error:", insertErr);
      throw new Error("Failed to create payment record");
    }

    // Get Monnify auth token
    const token = await getMonnifyAuthToken();

    // Initialize transaction with Monnify
    const monnifyPayload = {
      amount: amount, // Monnify expects amount in naira, not kobo
      currencyCode: "NGN",
      contractCode: process.env.MONNIFY_CONTRACT_CODE,
      customerEmail: email,
      customerName: user.name || meta?.name || "Customer",
      paymentReference: reference,
      paymentDescription: meta?.description || "Order Payment",
      redirectUrl: `${process.env.FRONTEND_URL}/payment/callback?reference=${reference}&autoVerify=true`,
      paymentMethods: ["CARD", "ACCOUNT_TRANSFER"], // Optional: specify allowed methods
    };

    const monnifyRes = await fetch(`${baseUrl}/merchant/transactions/init-transaction`, {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${token}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify(monnifyPayload),
    });

    const monnifyData = await monnifyRes.json();
    
    if (!monnifyRes.ok || !monnifyData.requestSuccessful) {
      console.error("[INIT] Monnify error:", monnifyData);
      throw new Error(monnifyData.responseMessage || "Failed to initialize payment with Monnify");
    }

    console.log("[INIT] Payment initialized:", reference);

    return res.json({
      success: true,
      data: {
        paymentReference: reference,
        checkoutUrl: monnifyData.responseBody.checkoutUrl,
        transactionReference: monnifyData.responseBody.transactionReference,
      },
    });
  } catch (err) {
    console.error("[INIT] Error:", err.message);
    return res.status(500).json({ 
      success: false, 
      message: err.message || "Server error initializing payment" 
    });
  }
};

// Verify payment manually
export const verifyPayment = async (req, res) => {
  try {
    const user = req.user;

    // Check user authentication
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User not found.",
      });
    }

    // Get reference from query and clean it
    let { reference } = req.query;
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Reference required",
      });
    }

    // Strip any extra query params
    reference = reference.split("?")[0];

    // Get payment from DB
    const { data: payment, error: fetchErr } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // If already processed, return status
    if (payment.status === "paid") {
      return res.json({
        success: true,
        paid: true,
        status: "PAID",
        message: "Payment already processed",
        amount: payment.amount, // amount in naira
      });
    }

    // Query Monnify for payment status
    const token = await getMonnifyAuthToken();
    const monnifyRes = await fetch(
      `${baseUrl}/merchant/transactions/query?paymentReference=${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const monnifyData = await monnifyRes.json();

    if (!monnifyRes.ok || !monnifyData.requestSuccessful) {
      console.error("[VERIFY] Monnify error:", monnifyData);
      throw new Error(monnifyData.responseMessage || "Failed to verify payment");
    }

    const isPaid = monnifyData.responseBody.paymentStatus === "PAID";

    // Process payment if paid
    if (isPaid) {
      await processPayment(payment, isPaid);
    }

    console.log(`[VERIFY] Payment ${reference}: ${isPaid ? "PAID" : "NOT PAID"}`);

    return res.json({
      success: true,
      paid: isPaid,
      status: monnifyData.responseBody.paymentStatus,
      amount: monnifyData.responseBody.amountPaid / 100, // convert kobo to naira
      message: isPaid ? "Payment successful" : "Payment not completed",
    });
  } catch (err) {
    console.error("[VERIFY] Error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error verifying payment",
    });
  }
};


// Webhook: Monnify calls this on payment events
export const handleWebhook = async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers["monnify-signature"];

    // Verify webhook signature for security
    if (process.env.NODE_ENV === "production" && signature) {
      const isValid = verifyMonnifyWebhook(payload, signature);
      if (!isValid) {
        console.error("[WEBHOOK] Invalid signature");
        return res.status(401).json({ message: "Invalid signature" });
      }
    }

    const { paymentReference, paymentStatus, transactionReference } = payload;
    
    if (!paymentReference || !paymentStatus) {
      console.error("[WEBHOOK] Missing required fields");
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Get payment from DB
    const { data: payment, error: fetchErr } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", paymentReference)
      .single();

    if (fetchErr || !payment) {
      console.error("[WEBHOOK] Payment not found:", paymentReference);
      return res.status(404).json({ message: "Payment not found" });
    }

    // Avoid reprocessing
    if (payment.status === "paid") {
      console.log(`[WEBHOOK] Payment already processed: ${paymentReference}`);
      return res.status(200).json({ message: "Already processed" });
    }

    const isPaid = paymentStatus === "PAID";
    await processPayment(payment, isPaid);

    console.log(`[WEBHOOK] Payment processed: ${paymentReference} -> ${paymentStatus}`);
    
    return res.status(200).json({ 
      message: "Webhook processed successfully",
      reference: paymentReference 
    });
  } catch (err) {
    console.error("[WEBHOOK] Error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};