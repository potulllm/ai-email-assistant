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

/* ===== KLUCZE ===== */
const keysFilePath = path.join(__dirname, "keys.json");

/* 🔒 GWARANCJA ISTNIENIA PLIKU */
if (!fs.existsSync(keysFilePath)) {
  fs.writeFileSync(keysFilePath, JSON.stringify([], null, 2));
  console.log("Utworzono keys.json");
}

/* WCZYTANIE KLUCZY */
function loadKeys() {
  try {
    const data = fs.readFileSync(keysFilePath, "utf-8");
    return new Set(JSON.parse(data));
  } catch (err) {
    console.error("Błąd wczytywania keys.json:", err);
    return new Set();
  }
}

/* ZAPIS KLUCZY */
function saveKeys() {
  fs.writeFileSync(
    keysFilePath,
    JSON.stringify([...accessKeys], null, 2)
  );
  console.log("Zapisano keys.json:", [...accessKeys]);
}

const accessKeys = loadKeys();

/* GENERATOR */
function generateAccessKey() {
  return crypto.randomBytes(16).toString("hex");
}

/* MIDDLEWARE */
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

    const prompt = `
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
          messages: [{ role: "user", content: prompt }]
        })
      }
    );

    const data = await aiResponse.json();

    if (!data.choices || !data.choices[0]) {
      return res.json({ result: "Błąd AI." });
    }

    res.json({ result: data.choices[0].message.content });

  } catch (err) {
    console.error("Błąd serwera:", err);
    res.json({ result: "Błąd serwera." });
  }
});

/* ===== GENEROWANIE KLUCZY (ADMIN) ===== */
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
