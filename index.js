import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "zmien_to_haslo";

/* ===== PODSTAWY ===== */
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

/* ===== STYLE ODPOWIEDZI ===== */
const stylePrompts = {
  professional: `
- formalna forma grzecznościowa (Pan / Pani / Państwo)
- rzeczowy, spokojny ton
- pełne, poprawne zdania
`,
  friendly: `
- uprzejmy, cieplejszy ton
- nadal forma grzecznościowa
- bardziej ludzki język
`,
  concise: `
- bardzo krótko i konkretnie
- bez wstępów
`,
  partner: `
- partnerski, doradczy ton
- sugeruj rozwiązania
`,
  corporate: `
- bardzo formalny, neutralny styl
- język jak w dużej organizacji
`
};

/* ===== KLUCZE ===== */
const keysFilePath = path.join(__dirname, "keys.json");

function loadKeys() {
  try {
    return new Set(JSON.parse(fs.readFileSync(keysFilePath, "utf-8")));
  } catch {
    return new Set();
  }
}

function saveKeys() {
  fs.writeFileSync(keysFilePath, JSON.stringify([...accessKeys], null, 2));
}

const accessKeys = loadKeys();

function generateAccessKey() {
  return crypto.randomBytes(16).toString("hex");
}

function checkAccess(req, res, next) {
  const key = req.query.key;
  if (!key || !accessKeys.has(key)) {
    return res.status(403).json({ error: "Brak dostępu" });
  }
  next();
}

/* ===== ANALYZE ===== */
app.post("/analyze", checkAccess, async (req, res) => {
  try {
    const emailText = req.body.email || "";
    const responseType = req.body.responseType || "default";
    const responseStyle = req.body.responseStyle || "professional";
    const pricingText = req.body.pricingText || "";

    if (!emailText.trim()) {
      return res.json({ result: "Brak treści maila." });
    }

    const styleRules =
      stylePrompts[responseStyle] || stylePrompts.professional;

    const prompt = `
FORMA JĘZYKOWA:
- zawsze forma grzecznościowa
- nigdy nie używaj „ty”

STYL:
${styleRules}

TYP ODPOWIEDZI: ${responseType}

JEŚLI TYP = pricing:
- użyj TYLKO cen podanych przez użytkownika
- jeśli brak cen, odpowiedz ogólnie

CENY:
${pricingText}

ZWRÓĆ FORMAT:

🧠 TYTUŁ SPRAWY:
...

🏷️ TAGI:
...

📂 KATEGORIA:
...

⚠️ PRIORYTET:
wysoki / normalny / niski

✉️ GOTOWA ODPOWIEDŹ DO KLIENTA:
...

📝 UWAGI:
...

MAIL KLIENTA:
${emailText}
`;

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Jesteś profesjonalnym asystentem obsługi klienta." },
            { role: "user", content: prompt }
          ],
          temperature: 0.6
        })
      }
    );

    const data = await aiResponse.json();

    if (!data.choices || !data.choices[0]) {
      return res.json({ result: "Błąd AI – brak odpowiedzi." });
    }

    res.json({ result: data.choices[0].message.content });

  } catch (err) {
    console.error(err);
    res.json({ result: "Błąd serwera." });
  }
});

/* ===== GENEROWANIE KLUCZY ===== */
app.get("/generate-key", (req, res) => {
  if (req.query.admin !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Brak dostępu admina" });
  }

  const newKey = generateAccessKey();
  accessKeys.add(newKey);
  saveKeys();

  res.json({ key: newKey });
});

/* ===== START ===== */
app.listen(PORT, () => {
  console.log("Serwer działa na http://localhost:" + PORT);
});
