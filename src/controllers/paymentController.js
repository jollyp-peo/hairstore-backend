import { paystackService } from '../utilis/paystackService.js';
import { supabase } from '../config/supabaseClient.js'
import { paystackConfig } from '../config/paystack.js';

// POST /api/payments/paystack/initialize
export const initializePayment = async (req, res) => {
  try {
    const user = req.user; // from protect middleware
    const {
      amount,           // number in naira
      email,            // email used by paystack
      reference,        // reference (unique)
      currency = 'NGN',
      cart,             // snapshot of cart
      meta,             // metadata
    } = req.body;

    console.log('[INIT] Payment initialization request:', {
      user_id: user?.id,
      amount,
      email,
      reference,
      currency,
      cart_items: cart?.length || 0
    });

    if (!amount || !email || !reference) {
      console.warn('[INIT] Missing required fields:', { amount: !!amount, email: !!email, reference: !!reference });
      return res.status(400).json({ success: false, message: 'amount, email and reference are required' });
    }

    if (!user?.id) {
      console.warn('[INIT] No user found in request');
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    // Create a payment row before redirect
    const paymentData = {
      user_id: user.id,
      reference,
      amount_kobo: paystackService.toKobo(amount),
      currency,
      status: 'initialized',
      cart,
      meta,
      gateway: 'paystack',
    };

    console.log('[INIT] Creating payment record:', paymentData);

    const { error: insertErr } = await supabase
      .from('payments')
      .insert(paymentData);

    if (insertErr) {
      console.error('[INIT] Database insert error:', insertErr);
      // Check if it's a duplicate reference error
      if (insertErr.code === '23505' || insertErr.message?.includes('duplicate')) {
        return res.status(400).json({ success: false, message: 'Payment reference already exists. Please try again.' });
      }
      return res.status(400).json({ success: false, message: insertErr.message });
    }

    console.log('[INIT] Payment record created successfully');

    // Initialize with Paystack
    const callback_url = `${paystackConfig.frontendUrl}/payment/callback?fallback=${encodeURIComponent(`${paystackConfig.frontendUrl}/payment/verify`)}`;
    console.log('[INIT] Callback URL:', callback_url);

    const ps = await paystackService.initialize({
      email,
      amountNaira: amount,
      currency,
      reference,
      callback_url,
      metadata: {
        user_id: user.id,
        ...(meta || {}),
      },
    });

    console.log('[INIT] Paystack response:', {
      status: ps?.status,
      message: ps?.message,
      has_data: !!ps?.data,
      authorization_url: ps?.data?.authorization_url ? 'present' : 'missing'
    });

    if (!ps?.status) {
      console.error('[INIT] Paystack initialization failed:', ps?.message);
      return res.status(400).json({ success: false, message: ps?.message || 'Paystack init failed' });
    }

    // Return Paystack checkout URL
    console.log('[INIT] Payment initialization successful');
    return res.json({
      success: true,
      authorization_url: ps.data.authorization_url,
      reference: ps.data.reference,
      access_code: ps.data.access_code,
    });
  } catch (err) {
    console.error('[INIT] Paystack initialize error:', err);
    return res.status(500).json({ success: false, message: 'Server error during payment initialization' });
  }
};

// GET /api/payments/paystack/verify?reference=xxxx
export const verifyPayment = async (req, res) => {
  try {
    console.log('backend verifypayment called')
    const { reference } = req.query;
    const user = req.user; // from protect middleware

    console.log("[VERIFY] Incoming verification request:", {
      reference,
      user_id: user?.id,
      timestamp: new Date().toISOString()
    });

    if (!reference) {
      console.warn("[VERIFY] No reference provided");
      return res.status(400).json({ success: false, message: 'reference is required' });
    }

    if (!user?.id) {
      console.warn("[VERIFY] No user found in request");
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    // Check if payment exists in our database first
    const { data: existingPayment, error: fetchErr } = await supabase
      .from('payments')
      .select('*')
      .eq('reference', reference)
      .eq('user_id', user.id) // Ensure user owns this payment
      .single();

    if (fetchErr) {
      console.error("[VERIFY] Error fetching payment from database:", fetchErr);
      return res.status(400).json({ success: false, message: 'Payment not found or access denied' });
    }

    console.log("[VERIFY] Found payment in database:", {
      reference: existingPayment.reference,
      status: existingPayment.status,
      user_id: existingPayment.user_id
    });

    // If already paid, return success
    if (existingPayment.status === 'paid') {
      console.log("[VERIFY] Payment already marked as paid");
      return res.json({
        success: true,
        paid: true,
        data: { status: 'success', reference }
      });
    }

    // Verify with Paystack
    console.log("[VERIFY] Verifying with Paystack...");
    const ps = await paystackService.verify(reference);
    
    console.log("[VERIFY] Paystack verification response:", {
      status: ps?.status,
      data_status: ps?.data?.status,
      data_reference: ps?.data?.reference,
      gateway_response: ps?.data?.gateway_response
    });

    if (!ps?.status) {
      console.error("[VERIFY] Paystack verification failed:", ps?.message);
      return res.status(400).json({ success: false, message: ps?.message || 'Verification failed' });
    }

    // Map result
    const isPaid = ps.data?.status === 'success';
    const newStatus = isPaid ? 'paid' : (ps.data?.status || 'failed');

    console.log("[VERIFY] Updating payment status to:", newStatus);

    // Update payment status
    const updateData = {
      status: newStatus,
      authorization: ps.data?.authorization || null,
      paid_at: isPaid ? new Date().toISOString() : null,
      gateway: ps.data?.gateway || 'paystack',
      updated_at: new Date().toISOString()
    };

    const { error: updErr } = await supabase
      .from('payments')
      .update(updateData)
      .eq('reference', reference)
      .eq('user_id', user.id); // Ensure user owns this payment

    if (updErr) {
      console.error('[VERIFY] Supabase update error:', updErr);
      // Don't fail the request if update fails, but log it
    } else {
      console.log("[VERIFY] Database updated successfully for reference:", reference);
    }

    // If payment is successful, you might want to trigger order fulfillment here
    if (isPaid) {
      console.log("[VERIFY] Payment verified as successful - consider triggering order fulfillment");
      // TODO: Trigger order fulfillment, send confirmation email, etc.
    }

    return res.json({
      success: true,
      paid: isPaid,
      data: ps.data,
    });
  } catch (err) {
    console.error('[VERIFY] Paystack verify error:', err);
    return res.status(500).json({ success: false, message: 'Server error during payment verification' });
  }
};

// POST /api/payments/paystack/webhook
export const handleWebhook = async (req, res) => {
  try {
    console.log('[WEBHOOK] Received webhook event');
    
    const signature = req.headers['x-paystack-signature'];
    const raw = req.rawBody || ''; // set by raw body parser
    
    console.log('[WEBHOOK] Validating signature...');
    const valid = paystackService.isValidWebhook(raw, signature);

    if (!valid) {
      console.warn('[WEBHOOK] Invalid signature');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    console.log('[WEBHOOK] Signature validated');

    const event = req.body; // JSON parsed by express after raw capture
    const type = event?.event;
    const data = event?.data;

    console.log('[WEBHOOK] Event details:', {
      type,
      reference: data?.reference,
      status: data?.status,
      amount: data?.amount
    });

    if (!type || !data) {
      console.warn('[WEBHOOK] Invalid payload structure');
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    // We care about charge.success / charge.failed
    if (type === 'charge.success') {
      const reference = data.reference;
      console.log('[WEBHOOK] Processing successful charge for reference:', reference);
      
      const { error: updateErr } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          authorization: data.authorization || null,
          paid_at: new Date().toISOString(),
          gateway_response: data.gateway_response || null,
          updated_at: new Date().toISOString()
        })
        .eq('reference', reference);

      if (updateErr) {
        console.error('[WEBHOOK] Error updating successful payment:', updateErr);
      } else {
        console.log('[WEBHOOK] Successfully updated payment to paid status');
        // TODO: fulfill order, send email, etc.
      }
    }

    if (type === 'charge.failed') {
      const reference = data.reference;
      console.log('[WEBHOOK] Processing failed charge for reference:', reference);
      
      const { error: updateErr } = await supabase
        .from('payments')
        .update({ 
          status: 'failed',
          gateway_response: data.gateway_response || null,
          updated_at: new Date().toISOString()
        })
        .eq('reference', reference);

      if (updateErr) {
        console.error('[WEBHOOK] Error updating failed payment:', updateErr);
      } else {
        console.log('[WEBHOOK] Successfully updated payment to failed status');
      }
    }

    console.log('[WEBHOOK] Webhook processed successfully');
    return res.sendStatus(200);
  } catch (err) {
    console.error('[WEBHOOK] Webhook processing error:', err);
    return res.sendStatus(500);
  }
};