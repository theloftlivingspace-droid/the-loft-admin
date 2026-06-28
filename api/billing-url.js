export default function handler(req, res) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(500).json({ error: 'ADMIN_TOKEN not set' });
  const url = `https://hotel-line-bot.onrender.com/?token=${encodeURIComponent(token)}`;
  res.status(200).json({ url });
}
