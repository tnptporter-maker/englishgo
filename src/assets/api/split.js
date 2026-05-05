export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { sentence } = req.body;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a language learning app. Given an English sentence, identify 2-3 key phrases or expressions that are most important for learners to remember. These should be meaningful chunks like idioms, verb phrases, or key expressions - not single common words. Return ONLY a JSON array of strings, no explanation.\nSentence: "${sentence}"`
            }]
          }]
        }),
      }
    );
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.match(/\[.*\]/s);
    if (match) {
      const blanks = JSON.parse(match[0]);
      res.status(200).json({ blanks });
    } else {
      res.status(200).json({ blanks: [] });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}