import { supabase } from "../config/supabaseClient.js";
import nodemailer from "nodemailer";
import crypto from "crypto";

// Generate secure payment reference
export const generateReference = () =>
  `REF_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

// Send order confirmation email
export const sendOrderConfirmation = async (payment, reference) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    const customerEmail = payment.meta?.email || payment.email;

    let itemsHtml = "";
    if (payment.cart?.length) {
      itemsHtml = payment.cart
        .map(
          (item) => `<tr>
            <td style="padding:8px;border:1px solid #ddd;">${item.name} ${item.variantName || ""}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.quantity}</td>
            <td style="padding:8px;border:1px solid #ddd;">₦${item.price.toLocaleString()}</td>
            <td style="padding:8px;border:1px solid #ddd;">₦${(item.price * item.quantity).toLocaleString()}</td>
          </tr>`
        )
        .join("");
    }

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;background:#f9f9f9;padding:20px;">
        <div style="max-width:600px;margin:auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.1);">
          <div style="background:#000;color:#fff;padding:20px;text-align:center;">
            <img src="${process.env.STORE_LOGO_URL || "https://via.placeholder.com/120x40?text=Logo"}" alt="Logo" style="max-height:40px;margin-bottom:10px;">
            <h2>Order Confirmation</h2>
          </div>
          <div style="padding:20px;">
            <p>Hi there,</p>
            <p>Thank you for shopping with us. Your payment has been received successfully.</p>
            <p><strong>Order Reference:</strong> ${reference}</p>
            <h3>Order Summary</h3>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f0f0f0;">
                  <th style="padding:8px;border:1px solid #ddd;text-align:left;">Product</th>
                  <th style="padding:8px;border:1px solid #ddd;text-align:center;">Qty</th>
                  <th style="padding:8px;border:1px solid #ddd;text-align:right;">Price</th>
                  <th style="padding:8px;border:1px solid #ddd;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml || "<tr><td colspan='4'>No items found</td></tr>"}
              </tbody>
            </table>
            <p><strong>Total Paid:</strong> ₦${(payment.amount / 100).toLocaleString()} ${payment.currency}</p>
          </div>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"Your Store" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject: `Order Confirmation - Ref ${reference}`,
      html: emailHtml,
    });

    console.log("[EMAIL] Confirmation sent to:", customerEmail);
  } catch (err) {
    console.error("[EMAIL] Sending failed:", err);
  }
};

// Process payment & create order
export const processPayment = async (payment, isPaid) => {
  await supabase
    .from("payments")
    .update({ status: isPaid ? "paid" : "failed", paid_at: isPaid ? new Date().toISOString() : null })
    .eq("reference", payment.reference);

  if (!isPaid) return;

  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("payment_reference", payment.reference)
    .maybeSingle();

  let orderId;

  if (!existingOrder) {
    const { data: newOrder } = await supabase
      .from("orders")
      .insert({
        user_id: payment.user_id,
        payment_reference: payment.reference,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: "processing",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    orderId = newOrder.id;

    if (payment.cart?.length) {
      const orderItems = payment.cart.map((item) => ({
        order_id: orderId,
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      }));
      await supabase.from("order_items").insert(orderItems);
    }
  }

  await sendOrderConfirmation(payment, payment.reference);
};
