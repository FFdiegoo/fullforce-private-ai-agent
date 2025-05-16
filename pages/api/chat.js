export default async function handler(req, res) {
  const { prompt } = req.body;
  // stub: echo back
  res.status(200).json({ reply: `Je zei: “${prompt}”` });
}