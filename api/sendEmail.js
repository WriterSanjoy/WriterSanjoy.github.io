// api/sendEmail.js
const emailjs = require('@emailjs/nodejs');

module.exports = async function handler(req, res) {
  // ✅ CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 🔽 Extract variables from frontend payload
    const { to_name, to_email, header, message_block } = req.body;

    // 🔽 Call EmailJS with env vars
    const result = await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_REPLY_ID,   // 👈 switched here
      {
        to_name,
        to_email,
        header,
        message_block,
      },
      {
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
        privateKey: process.env.EMAILJS_PRIVATE_KEY,
      }
    );

    // ✅ Always return JSON
    res.status(200).json({ message: 'Email sent successfully!', result });
  } catch (error) {
    console.error('SendEmail error:', error);
    res.status(500).json({ 
      error: error.message || 'Server error',
      details: error.text || JSON.stringify(error)
    });
  }
};