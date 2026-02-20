const express = require("express");
const fs = require("fs");
const path = require("path");
const open = (...args) => import('open').then(module => module.default(...args));
const axios = require("axios");

const app = express();

function loadEnvFromFile() {
  const envPath = path.resolve(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

loadEnvFromFile();

const PORT = Number(process.env.OAUTH_PORT || 3000);
const CLIENT_ID = requireEnv("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = requireEnv("GOOGLE_CLIENT_SECRET");
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}`;

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/chromewebstore",
    access_type: "offline", // gives refresh token
    prompt: "consent", // always prompt to get refresh token
  });

app.get("/", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code received.");

  res.send("Authorization successful! You can close this tab.");
  console.log("Authorization Code:", code);

  const tokenResponse = await axios.post(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    })
  );

  console.log("Tokens:", tokenResponse.data);
  console.log("Save the refresh_token for automation!");
  process.exit();
});

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
  open(authUrl);
});
