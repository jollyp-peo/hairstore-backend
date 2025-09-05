import { paystackService } from "../utilis/paystackService.js";
import { supabase } from "../config/supabaseClient.js";
import { paystackConfig } from "../config/paystack.js";

// POST /api/payments/paystack/initialize
export const initializePayment = async (req, res) => {
	try {
		const user = req.user; // from protect middleware
		const {
			amount, // number in naira
			email, // email used by paystack
			currency = "NGN",
			cart, // snapshot of cart
			meta, // metadata
		} = req.body;

		console.log("[INIT] Payment initialization request:", {
			user_id: user?.id,
			amount,
			email,
			currency,
			cart_items: cart?.length || 0,
		});

		if (!amount || !email) {
			console.warn("[INIT] Missing required fields:", {
				amount: !!amount,
				email: !!email,
			});
			return res
				.status(400)
				.json({ success: false, message: "amount and email are required" });
		}

		if (!user?.id) {
			console.warn("[INIT] No user found in request");
			return res
				.status(401)
				.json({ success: false, message: "User authentication required" });
		}

		// Generate unique reference server-side
		const ref = `REF_${Date.now()}_${Math.random()
			.toString(36)
			.substring(2, 10)}`;

		// Create a payment row before redirect
		const paymentData = {
			user_id: user.id,
			reference: ref,
			amount_kobo: paystackService.toKobo(amount),
			currency,
			status: "initialized",
			cart,
			meta,
			gateway: "paystack",
		};

		console.log("[INIT] Creating payment record:", paymentData);

		const { error: insertErr } = await supabase
			.from("payments")
			.insert(paymentData);

		if (insertErr) {
			console.error("[INIT] Database insert error:", insertErr);
			if (
				insertErr.code === "23505" ||
				insertErr.message?.includes("duplicate")
			) {
				return res.status(400).json({
					success: false,
					message: "Payment reference already exists. Please try again.",
				});
			}
			return res
				.status(400)
				.json({ success: false, message: insertErr.message });
		}

		console.log("[INIT] Payment record created successfully");

		// Initialize with Paystack
		const callback_url = `${
			paystackConfig.frontendUrl
		}/payment/callback?fallback=${encodeURIComponent(
			`${paystackConfig.frontendUrl}/payment/verify`
		)}`;
		console.log("[INIT] Callback URL:", callback_url);

		const ps = await paystackService.initialize({
			email,
			amountNaira: amount,
			currency,
			reference: ref,
			callback_url,
			metadata: {
				user_id: user.id,
				...(meta || {}),
			},
		});

		console.log("[INIT] Paystack response:", {
			status: ps?.status,
			message: ps?.message,
			has_data: !!ps?.data,
			authorization_url: ps?.data?.authorization_url ? "present" : "missing",
		});

		if (!ps?.status) {
			console.error("[INIT] Paystack initialization failed:", ps?.message);
			return res.status(400).json({
				success: false,
				message: ps?.message || "Paystack init failed",
			});
		}

		// Return Paystack checkout URL
		console.log("[INIT] Payment initialization successful");
		return res.json({
			success: true,
			authorization_url: ps.data.authorization_url,
			reference: ps.data.reference, // Paystack should echo back the same ref
			access_code: ps.data.access_code,
		});
	} catch (err) {
		console.error("[INIT] Paystack initialize error:", err);
		return res.status(500).json({
			success: false,
			message: "Server error during payment initialization",
		});
	}
};

// GET /api/payments/paystack/verify?reference=xxxx
export const verifyPayment = async (req, res) => {
	try {
		console.log("backend verifypayment called");
		const { reference } = req.query;
		const user = req.user; // from protect middleware

		console.log("[VERIFY] Incoming verification request:", {
			reference,
			user_id: user?.id,
			timestamp: new Date().toISOString(),
		});

		if (!reference) {
			console.warn("[VERIFY] No reference provided");
			return res
				.status(400)
				.json({ success: false, message: "reference is required" });
		}

		if (!user?.id) {
			console.warn("[VERIFY] No user found in request");
			return res
				.status(401)
				.json({ success: false, message: "User authentication required" });
		}

		// Ensure payment exists in our database first
		const { data: existingPayment, error: fetchErr } = await supabase
			.from("payments")
			.select("*")
			.eq("reference", reference)
			.eq("user_id", user.id) // ensure user owns this payment
			.single();

		if (fetchErr || !existingPayment) {
			console.error(
				"[VERIFY] Payment not found in DB or access denied:",
				fetchErr
			);
			return res.status(404).json({
				success: false,
				message: "Payment not found or access denied",
			});
		}

		console.log("[VERIFY] Found payment in database:", {
			reference: existingPayment.reference,
			status: existingPayment.status,
			user_id: existingPayment.user_id,
		});

		// If already paid, don’t call Paystack again
		if (existingPayment.status === "paid") {
			console.log("[VERIFY] Payment already marked as paid");
			return res.json({
				success: true,
				paid: true,
				data: { status: "success", reference },
			});
		}

		// Only verify with Paystack if still initialized or failed
		if (
			existingPayment.status !== "initialized" &&
			existingPayment.status !== "failed"
		) {
			console.warn(
				"[VERIFY] Payment not in a verifiable state:",
				existingPayment.status
			);
			return res.status(400).json({
				success: false,
				message: `Cannot verify payment in status: ${existingPayment.status}`,
			});
		}

		console.log("[VERIFY] Verifying with Paystack...");
		const ps = await paystackService.verify(reference);

		console.log("[VERIFY] Paystack verification response:", {
			status: ps?.status,
			data_status: ps?.data?.status,
			data_reference: ps?.data?.reference,
			gateway_response: ps?.data?.gateway_response,
		});

		if (!ps?.status) {
			console.error("[VERIFY] Paystack verification failed:", ps?.message);
			return res.status(400).json({
				success: false,
				message: ps?.message || "Verification failed",
			});
		}

		// Map result
		const isPaid = ps.data?.status === "success";
		const newStatus = isPaid ? "paid" : ps.data?.status || "failed";

		console.log("[VERIFY] Updating payment status to:", newStatus);

		// Update payment record
		const updateData = {
			status: newStatus,
			authorization: ps.data?.authorization || null,
			paid_at: isPaid ? new Date().toISOString() : null,
			gateway: ps.data?.gateway || "paystack",
			updated_at: new Date().toISOString(),
		};

		const { error: updErr } = await supabase
			.from("payments")
			.update(updateData)
			.eq("reference", reference)
			.eq("user_id", user.id);

		if (updErr) {
			console.error("[VERIFY] Supabase update error:", updErr);
			// Don't fail the request if update fails, but log it
		} else {
			console.log(
				"[VERIFY] Database updated successfully for reference:",
				reference
			);
		}

		if (isPaid) {
			console.log(
				"[VERIFY] Payment verified as successful - checking if order exists..."
			);

			// Check if order already exists for this payment
			const { data: existingOrder, error: orderCheckErr } = await supabase
				.from("orders")
				.select("id")
				.eq("payment_reference", reference)
				.single();

			if (orderCheckErr && orderCheckErr.code !== "PGRST116") {
				console.error("[VERIFY] Order check error:", orderCheckErr);
			}

			if (!existingOrder) {
				console.log("[VERIFY] Creating new order for reference:", reference);

				const orderData = {
					user_id: user.id,
					payment_reference: reference,
					amount: existingPayment.amount_kobo / 100, // convert kobo to Naira
					currency: existingPayment.currency || "NGN",
					status: "pending", // default before fulfillment
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				};

				const { data: newOrder, error: orderErr } = await supabase
					.from("orders")
					.insert(orderData)
					.select()
					.single();

				if (orderErr) {
					console.error("[VERIFY] Failed to create order:", orderErr);
				} else {
					console.log("[VERIFY] Order created successfully:", newOrder);

					// If you store cart items in payment row
					if (existingPayment.cart?.length) {
						console.log("[VERIFY] Inserting order items...");

						const orderItems = existingPayment.cart.map((item) => ({
							order_id: newOrder.id,
							product_id: item.productId,
							variant_id: item.variantId,
							quantity: item.quantity,
							price: item.price, // store unit price at purchase time
							total: item.price * item.quantity,
						}));

						const { error: itemsErr } = await supabase
							.from("order_items")
							.insert(orderItems);

						if (itemsErr) {
							console.error("[VERIFY] Failed to insert order items:", itemsErr);
						} else {
							console.log("[VERIFY] Order items inserted successfully");
						}
					}
				}
			} else {
				console.log("[VERIFY] Order already exists, skipping creation");
			}
		}

		return res.json({
			success: true,
			paid: isPaid,
			data: ps.data,
		});
	} catch (err) {
		console.error("[VERIFY] Paystack verify error:", err);
		return res.status(500).json({
			success: false,
			message: "Server error during payment verification",
		});
	}
};

// POST /api/payments/paystack/webhook
export const handleWebhook = async (req, res) => {
	try {
		console.log("[WEBHOOK] Received webhook event");

		const signature = req.headers["x-paystack-signature"];
		const raw = req.rawBody || ""; // set by raw body parser

		console.log("[WEBHOOK] Validating signature...");
		const valid = paystackService.isValidWebhook(raw, signature);

		if (!valid) {
			console.warn("[WEBHOOK] Invalid signature");
			return res
				.status(401)
				.json({ success: false, message: "Invalid signature" });
		}

		console.log("[WEBHOOK] Signature validated");

		const event = req.body; // JSON parsed by express after raw capture
		const type = event?.event;
		const data = event?.data;

		console.log("[WEBHOOK] Event details:", {
			type,
			reference: data?.reference,
			status: data?.status,
			amount: data?.amount,
		});

		if (!type || !data) {
			console.warn("[WEBHOOK] Invalid payload structure");
			return res
				.status(400)
				.json({ success: false, message: "Invalid payload" });
		}

		// We care about charge.success / charge.failed
		if (type === "charge.success") {
			const reference = data.reference;
			console.log("[WEBHOOK] Processing successful charge:", reference);

			// Update payment
			const { data: paymentRow, error: payErr } = await supabase
				.from("payments")
				.update({
					status: "paid",
					authorization: data.authorization || null,
					paid_at: new Date().toISOString(),
					gateway_response: data.gateway_response || null,
					updated_at: new Date().toISOString(),
				})
				.eq("reference", reference)
				.select()
				.single();

			if (payErr) {
				console.error("[WEBHOOK] Error updating payment:", payErr);
				return res.sendStatus(500);
			}

			console.log("[WEBHOOK] Payment updated:", paymentRow.reference);

			// Check if order already exists (idempotency)
			const { data: existingOrder } = await supabase
				.from("orders")
				.select("id")
				.eq("payment_reference", reference)
				.maybeSingle();

			if (existingOrder) {
				console.log("[WEBHOOK] Order already exists for reference:", reference);
			} else {
				console.log("[WEBHOOK] Creating new order...");

				// Create order
				const { data: newOrder, error: orderErr } = await supabase
					.from("orders")
					.insert({
						user_id: paymentRow.user_id,
						payment_reference: reference,
						amount: paymentRow.amount_kobo / 100, // store in Naira
						currency: paymentRow.currency,
						status: "processing",
					})
					.select()
					.single();

				if (orderErr) {
					console.error("[WEBHOOK] Error creating order:", orderErr);
				} else {
					console.log("[WEBHOOK] Order created:", newOrder.id);

					// Insert order items (from snapshot in payments.cart)
					if (paymentRow.cart && Array.isArray(paymentRow.cart)) {
						const items = paymentRow.cart.map((item) => ({
							order_id: newOrder.id,
							product_id: item.id,
							variant_id: item.variant_id || null,
							quantity: item.quantity,
							price: item.price,
							total: item.price * item.quantity,
						}));

						const { error: itemErr } = await supabase
							.from("order_items")
							.insert(items);

						if (itemErr) {
							console.error("[WEBHOOK] Error inserting order_items:", itemErr);
						} else {
							console.log("[WEBHOOK] Order items inserted:", items.length);
						}
					}
				}
			}

			// Send confirmation email
			try {
				const nodemailer = await import("nodemailer");

				const transporter = nodemailer.createTransport({
					service: "gmail", // or your SMTP provider
					auth: {
						user: process.env.EMAIL_USER,
						pass: process.env.EMAIL_PASS,
					},
				});

				const customerEmail = paymentRow.meta?.email || data.customer.email;

				// Build order summary HTML
				let itemsHtml = "";
				if (paymentRow.cart && Array.isArray(paymentRow.cart)) {
					itemsHtml = paymentRow.cart
						.map(
							(item) => `
          <tr>
            <td style="padding:8px;border:1px solid #ddd;">${item.name} ${
								item.variant_name ? `(${item.variant_name})` : ""
							}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.quantity}</td>
            <td style="padding:8px;border:1px solid #ddd;">₦${item.price.toLocaleString()}</td>
            <td style="padding:8px;border:1px solid #ddd;">₦${(
							item.price * item.quantity
						).toLocaleString()}</td>
          </tr>
        `
						)
						.join("");
				}

				const emailHtml = `
    <div style="font-family:Arial, sans-serif; background:#f9f9f9; padding:20px;">
      <div style="max-width:600px;margin:auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.1);">
        <div style="background:#000;color:#fff;padding:20px;text-align:center;">
          <img src="${
						process.env.STORE_LOGO_URL ||
						"https://via.placeholder.com/120x40?text=HairbyUrban"
					}" 
            alt="Logo" style="max-height:40px;margin-bottom:10px;">
          <h2 style="margin:0;">Order Confirmation</h2>
        </div>
        
        <div style="padding:20px;">
          <p>Hi there,</p>
          <p>Thank you for shopping with <strong>HairbyUrban</strong>. Your payment has been received successfully.</p>
          <p><strong>Order Reference:</strong> ${reference}</p>

          <h3 style="margin-top:20px;">Order Summary</h3>
          <table style="width:100%;border-collapse:collapse;margin-top:10px;">
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

          <p style="margin-top:20px;font-size:16px;">
            <strong>Total Paid:</strong> ₦${(
							paymentRow.amount_kobo / 100
						).toLocaleString()} ${paymentRow.currency}
          </p>

          <p style="margin-top:20px;">We’ll start processing your order and notify you once it ships.</p>

          <p style="margin-top:30px;font-size:12px;color:#888;">If you have any questions, reply to this email or contact our support.</p>
        </div>
      </div>
    </div>
  `;

				await transporter.sendMail({
					from: `"HairbyUrban" <${process.env.EMAIL_USER}>`,
					to: customerEmail,
					subject: `Your Order Confirmation - Ref ${reference}`,
					html: emailHtml,
				});

				console.log(
					"[WEBHOOK] Branded confirmation email sent to:",
					customerEmail
				);
			} catch (mailErr) {
				console.error("[WEBHOOK] Email send failed:", mailErr);
			}
		}

		// failure case
		if (type === "charge.failed") {
			const reference = data.reference;
			console.log(
				"[WEBHOOK] Processing failed charge for reference:",
				reference
			);

			const { error: updateErr } = await supabase
				.from("payments")
				.update({
					status: "failed",
					gateway_response: data.gateway_response || null,
					updated_at: new Date().toISOString(),
				})
				.eq("reference", reference);

			if (updateErr) {
				console.error("[WEBHOOK] Error updating failed payment:", updateErr);
			} else {
				console.log("[WEBHOOK] Successfully updated payment to failed status");
			}
		}

		console.log("[WEBHOOK] Webhook processed successfully");
		return res.sendStatus(200);
	} catch (err) {
		console.error("[WEBHOOK] Webhook processing error:", err);
		return res.sendStatus(500);
	}
};
