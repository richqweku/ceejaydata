const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── CONFIGURATION ──────────────────────────────────────────
const PAYSTACK_SECRET     = 'sk_live_3c11134dc9c016a813de08e847c3ea68639e6618';
const TELEGRAM_BOT_TOKEN  = '8595202827:AAEAkJMc07FLMW2FOMVKFKGYmVUDmaATIwE';
const TELEGRAM_CHAT_ID    = '5606750551';
const PORT                = process.env.PORT || 3000;
// ───────────────────────────────────────────────────────────


// ── SEND TELEGRAM MESSAGE ──────────────────────────────────
async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  });
}


// ── INITIALIZE PAYMENT ─────────────────────────────────────
// Called by frontend when customer clicks "Confirm"
app.post('/api/pay', async (req, res) => {
  const { phone, plan, price, network, email } = req.body;

  if (!phone || !plan || !price || !network) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const reference = `CEEJAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: email || `${phone}@ceejaydata.com`,
        amount: Math.round(price * 100), // Paystack uses pesewas
        currency: 'GHS',
        reference,
        metadata: {
          phone,
          plan,
          network,
          custom_fields: [
            { display_name: 'Phone Number', variable_name: 'phone', value: phone },
            { display_name: 'Data Plan',    variable_name: 'plan',  value: plan  },
            { display_name: 'Network',      variable_name: 'network', value: network }
          ]
        },
        callback_url: `https://ceejaydata.onrender.com/payment-success`
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      authorization_url: response.data.data.authorization_url,
      reference
    });

  } catch (err) {
    console.error('Paystack init error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});


// ── PAYSTACK WEBHOOK ───────────────────────────────────────
// Paystack calls this after payment is completed
app.post('/webhook/paystack', async (req, res) => {

  // Verify the request is genuinely from Paystack
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Unauthorized');
  }

  const event = req.body;

  if (event.event === 'charge.success') {
    const data     = event.data;
    const meta     = data.metadata;
    const phone    = meta?.phone    || 'N/A';
    const plan     = meta?.plan     || 'N/A';
    const network  = meta?.network  || 'N/A';
    const amount   = (data.amount / 100).toFixed(2);
    const ref      = data.reference;
    const paidAt   = new Date(data.paid_at).toLocaleString('en-GH', { timeZone: 'Africa/Accra' });

    const message =
`🎉 <b>NEW ORDER — CEEJAYDATA</b>

📶 <b>Network:</b> ${network}
📦 <b>Plan:</b> ${plan}
📞 <b>Send Data To:</b> <code>${phone}</code>
💵 <b>Amount Paid:</b> GHS ${amount}
🕐 <b>Time:</b> ${paidAt}
🔖 <b>Reference:</b> <code>${ref}</code>

✅ <b>Payment CONFIRMED — Process Now!</b>`;

    try {
      await sendTelegram(message);
      console.log('Telegram notification sent for:', ref);
    } catch (teleErr) {
      console.error('Telegram send error:', teleErr.message);
    }
  }

  res.sendStatus(200);
});


// ── PAYMENT SUCCESS PAGE ───────────────────────────────────
app.get('/payment-success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Successful – CEEJAYDATA</title>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
      <style>
        body { margin:0; background:#060D1A; color:#EEF4FF; font-family:'DM Sans',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; text-align:center; padding:20px; }
        .box { background:#0f2040; border:1px solid rgba(0,194,255,0.15); border-radius:20px; padding:40px 30px; max-width:380px; }
        .icon { font-size:60px; margin-bottom:16px; }
        h1 { font-family:'Syne',sans-serif; font-size:26px; margin-bottom:10px; }
        p { color:rgba(238,244,255,0.6); line-height:1.6; font-size:15px; }
        a { display:inline-block; margin-top:24px; padding:12px 28px; background:linear-gradient(135deg,#00C2FF,#0077ff); color:#fff; border-radius:10px; text-decoration:none; font-weight:600; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="icon">✅</div>
        <h1>Payment Successful!</h1>
        <p>Your data bundle order has been received. It will be processed and sent to your number shortly.</p>
        <p style="margin-top:12px;">Thank you for choosing <strong>CEEJAYDATA</strong>!</p>
        <a href="/">Back to Home</a>
      </div>
    </body>
    </html>
  `);
});


// ── SERVE FRONTEND FILES ───────────────────────────────────
app.use(express.static('public'));

// Fallback to index
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});


// ── START SERVER ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ CEEJAYDATA server running on port ${PORT}`);
});
