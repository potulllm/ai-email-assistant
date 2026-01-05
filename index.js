import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* ================= CONFIG ================= */
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "zmien_to_haslo";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

/* ================= BASIC ================= */
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

/* ================= ACCESS KEYS ================= */
const keysFilePath = path.join(__dirname, "keys.json");

/* ensure file exists */
if (!fs.existsSync(keysFilePath)) {
  fs.writeFileSync(keysFilePath, JSON.stringify([], null, 2));
}

/* load keys */
function loadKeys() {
  try {
    return new Set(JSON.parse(fs.readFileSync(keysFilePath, "utf-8")));
  } catch {
    return new Set();
  }
}

/* save keys */
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

/* ================= ANALYZE ================= */
app.post("/analyze", checkAccess, async (req, res) => {
  try {
    const emailText = req.body.email || "";

    if (!emailText.trim()) {
      return res.json({ result: "Brak treści maila." });
    }

    const prompt = `
Jesteś doświadczonym specjalistą ds. obsługi klienta i sprzedaży B2B.

TWOJE ZADANIA:
1. ZANALIZUJ maila klienta
2. OKREŚL jego pilność i intencję
3. STWÓRZ profesjonalną odpowiedź gotową do wysłania

ZASADY BEZWZGLĘDNE:
- MUSISZ uzupełnić KAŻDE pole poniżej
- JEŚLI czegoś brakuje → WYCIĄGNIJ WNIOSKI z kontekstu
- NIGDY nie zostawiaj pustych sekcji
- NIE dodawaj żadnego tekstu poza formatem
- Odpowiadaj po POLSKU

FORMA JĘZYKOWA:
- ZAWSZE forma grzecznościowa (Pan / Pani / Państwo)
- NIGDY forma „ty”

ZWRÓĆ ODPOWIEDŹ DOKŁADNIE W TYM FORMACIE:

🧠 TYTUŁ SPRAWY:
<krótki, rzeczowy tytuł oddający sens maila>

📂 KATEGORIA:
<np. wycena, zapytanie ofertowe, reklamacja, wsparcie, informacyjne>

⚠️ PRIORYTET:
<wysoki / normalny / niski>

🏷️ TAGI:
<2–4 krótkie hasła oddzielone przecinkami>

✉️ GOTOWA ODPOWIEDŹ DO KLIENTA:
<pełna, profesjonalna odpowiedź gotowa do wysłania>

📝 UWAGI:
<jedno zdanie: co klient naprawdę chce i jak najlepiej to obsłużyć>

MAIL KLIENTA:
${emailText}
`;

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Jesteś profesjonalnym asystentem obsługi klienta i sprzedaży."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.5
        })
      }
    );

    const data = await aiResponse.json();

    if (!data.choices || !data.choices[0]) {
      console.error("OPENAI ERROR:", data);
      return res.json({ result: "Błąd AI – brak odpowiedzi." });
    }

    res.json({ result: data.choices[0].message.content });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.json({ result: "Błąd serwera." });
  }
});

/* ================= ADMIN: GENERATE KEY ================= */
app.get("/generate-key", (req, res) => {
  if (req.query.admin !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Brak dostępu admina" });
  }

  const newKey = generateAccessKey();
  accessKeys.add(newKey);
  saveKeys();

  res.json({ key: newKey });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("Serwer działa na http://localhost:" + PORT);
});
