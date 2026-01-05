import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import fs from "fs";
import path from "path";


const ADMIN_SECRET = process.env.ADMIN_SECRET || "zmien_to_haslo";


const app = express();
app.use(express.json());
app.use(express.static("public"));

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
- bez wstępów i lania wody
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

// ===== KLUCZE DOSTĘPU =====
const keysFilePath = path.join(process.cwd(), "keys.json");

function loadKeys() {
  try {
    const data = fs.readFileSync(keysFilePath, "utf-8");
    return new Set(JSON.parse(data));
  } catch (err) {
    console.error("Nie można wczytać keys.json:", err);
    return new Set();
  }
}

function saveKeys(keysSet) {
  fs.writeFileSync(
    keysFilePath,
    JSON.stringify([...keysSet], null, 2)
  );
}

const accessKeys = loadKeys();


// generator profesjonalnego klucza
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


/* ===== ENDPOINT ===== */
app.post("/analyze", checkAccess, async (req, res) => {
  try {
    const emailText = req.body.text || "";
    const responseType = req.body.responseType || "default";
    const responseStyle = req.body.responseStyle || "professional";
    const pricingText = req.body.pricingText || "";

    if (!emailText.trim()) {
      return res.json({ result: "Brak treści maila." });
    }

    const styleRules =
      stylePrompts[responseStyle] || stylePrompts.professional;

    const prompt = `
FORMA JĘZYKOWA (OBOWIĄZKOWA):
- ZAWSZE używaj formy grzecznościowej (Pan / Pani / Państwo)
- NIGDY nie używaj formy „ty”
- NIGDY nie używaj słów: „mógłbyś”, „możesz”, „daj znać”

STYL ODPOWIEDZI:
${styleRules}

ZASADY OGÓLNE:
- brzmi jak człowiek, nie jak bot
- nie kończ odpowiedzi pustą obietnicą kontaktu
- pisz konkretnie, bez lania wody

ZABRONIONE FRAZY:
- skontaktujemy się
- wrócimy do Państwa
- dziękujemy za kontakt
- w razie pytań prosimy o kontakt

TYP ODPOWIEDZI: ${responseType}

JEŚLI TYP TO "pricing":
- użyj WYŁĄCZNIE cen podanych przez użytkownika
- NIE wymyślaj żadnych kwot
- jeśli ceny są puste, napisz ogólnie, bez liczb

CENY PODANE PRZEZ UŻYTKOWNIKA:
${pricingText}

ZWRÓĆ ODPOWIEDŹ DOKŁADNIE W TYM FORMACIE:

🧠 TYTUŁ SPRAWY:
<maks. 6 słów, bez uprzejmości, samo sedno>

🏷️ TAGI:
<2–4 krótkie hasła oddzielone przecinkami>

📂 KATEGORIA:
<jedno słowo>

⚠️ PRIORYTET:
<wysoki / normalny / niski>

✉️ GOTOWA ODPOWIEDŹ DO KLIENTA:
<formalna, konkretna odpowiedź – gotowa do wysłania>

📝 UWAGI:
<jedno zdanie – emocje klienta / pilność / sprzedaż>

JEŚLI BRAKUJE INFORMACJI:
- zadaj 1–3 konkretne pytania
- każde pytanie w osobnej linii
- NIE używaj formy „ty”

MAIL KLIENTA:
${emailText}
`;

    const response = await fetch(
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
            {
              role: "system",
              content:
                "Jesteś doświadczonym asystentem obsługi klienta. Analizujesz maile i tworzysz profesjonalne odpowiedzi."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.6
        })
      }
    );

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      console.error("BŁĄD OPENAI:", data);
      return res.json({ result: "Błąd AI – brak odpowiedzi." });
    }

    res.json({ result: data.choices[0].message.content });

  } catch (err) {
    console.error("BŁĄD SERWERA:", err);
    res.json({ result: "Błąd serwera." });
  }
});

app.post("/generate-key", (req, res) => {
  const admin = req.query.admin;

  if (admin !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Brak dostępu admina" });
  }

const newKey = generateAccessKey();
accessKeys.add(newKey);


  res.json({
    key: newKey
  });
});

app.get("/generate-key", (req, res) => {
  const admin = req.query.admin;

  if (admin !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Brak dostępu admina" });
  }

  const newKey = generateAccessKey();
  accessKeys.add(newKey);

  res.json({
    key: newKey
  });
});



app.listen(3000, () => {
  console.log("Serwer działa na http://localhost:3000");
});
