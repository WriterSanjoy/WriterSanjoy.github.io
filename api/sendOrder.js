import emailjs from '@emailjs/nodejs';

export default async function handler(req, res) {
  try {
    const orderParams = req.body;

    // 1️⃣ Publisher notification
    await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_CONFIRM_ID,
      orderParams,
      {
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
        privateKey: process.env.EMAILJS_PRIVATE_KEY
      }
    );

    // 2️⃣ Customer auto‑reply
    await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_REPLY_ID,
      {
        to_name: orderParams.customer_name,
        to_email: orderParams.customer_email,
        header: orderParams.book_title,
        book_icon: orderParams.book_icon,
        message_block: `Order Confirmation Details:\n
          Book: ${orderParams.book_title}\n
          Price: ${orderParams.book_price}\n
          Type: ${orderParams.order_type}\n
          Date: ${orderParams.order_date}`
      },
      {
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
        privateKey: process.env.EMAILJS_PRIVATE_KEY
      }
    );

    res.status(200).json({ message: "✅ Order placed successfully!" });
  } catch (err) {
    console.error("EmailJS error:", err);
    res.status(500).json({ error: "❌ Failed to send order emails" });
  }
}