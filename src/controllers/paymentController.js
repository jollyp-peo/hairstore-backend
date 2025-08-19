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
      reference,        // your reference (unique)
      currency = 'NGN',
      cart,             // optional snapshot of cart
      meta,             // optional metadata
    } = req.body;

    if (!amount || !email || !reference) {
      return res.status(400).json({ success: false, message: 'amount, email and reference are required' });
    }

    // Create a payment row before redirect
    const { error: insertErr } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        reference,
        amount_kobo: paystackService.toKobo(amount),
        currency,
        status: 'initialized',
        cart,
        meta,
        gateway: 'paystack',
      });

    if (insertErr) {
      // conflict? reference must be unique
      return res.status(400).json({ success: false, message: insertErr.message });
    }

    // Initialize with Paystack
    const callback_url = `${paystackConfig.frontendUrl}/payment/callback`;
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

    if (!ps?.status) {
      return res.status(400).json({ success: false, message: ps?.message || 'Paystack init failed' });
    }

    // Return Paystack checkout URL
    return res.json({
      success: true,
      authorization_url: ps.data.authorization_url,
      reference: ps.data.reference,
      access_code: ps.data.access_code,
    });
  } catch (err) {
    console.error('Paystack initialize error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/payments/paystack/verify?reference=xxxx
export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.query;
    console.log("🔍 [VERIFY] Incoming reference:", reference); //debbug
    if (!reference) return res.status(400).json({ success: false, message: 'reference is required' });
    console.warn("⚠️ [Controller.verify] No reference provided"); //debugg

    const ps = await paystackService.verify(reference);
    console.log("📦 [Controller.verify] Paystack response:", JSON.stringify(ps, null, 2)); //debugg
    if (!ps?.status) {
       console.error("❌ [Controller.verify] Verification failed:", ps?.message); //debugg
      return res.status(400).json({ success: false, message: ps?.message || 'Verification failed' });
    }

    // Map result
    const isPaid = ps.data?.status === 'success';

    const { error: updErr } = await supabase
      .from('payments')
      .update({
        status: isPaid ? 'paid' : ps.data?.status || 'failed',
        authorization: ps.data?.authorization || null,
        paid_at: isPaid ? new Date().toISOString() : null,
      })
      .eq('reference', reference);

    if (updErr) {
      console.error('Supabase update after verify error:', updErr);
    } else {
      console.log("✅ [Controller.verify] Supabase updated for reference:", reference); //else block for debbug
    }

    return res.json({
      success: true,
      paid: isPaid,
      data: ps.data,
    });
  } catch (err) {
    console.error('Paystack verify error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/payments/paystack/webhook
export const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const raw = req.rawBody || ''; // set by raw body parser
    const valid = paystackService.isValidWebhook(raw, signature);

    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body; // JSON parsed by express after raw capture
    const type = event?.event;
    const data = event?.data;

    if (!type || !data) return res.status(400).json({ success: false, message: 'Invalid payload' });

    // We care about charge.success / charge.failed
    if (type === 'charge.success') {
      const reference = data.reference;
      await supabase
        .from('payments')
        .update({
          status: 'paid',
          authorization: data.authorization || null,
          paid_at: new Date().toISOString(),
        })
        .eq('reference', reference);
      // TODO: fulfill order, send email, etc.
    }

    if (type === 'charge.failed') {
      const reference = data.reference;
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('reference', reference);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Paystack webhook error:', err);
    return res.sendStatus(500);
  }
};
