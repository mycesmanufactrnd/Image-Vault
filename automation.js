const fs = require("fs");
const path = require("path");
const axios = require("axios");

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

const CLIENT_ID = requireEnv("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = requireEnv("GOOGLE_CLIENT_SECRET");
const REFRESH_TOKEN = requireEnv("GOOGLE_REFRESH_TOKEN");
const EXTENSION_ID = requireEnv("CHROME_EXTENSION_ID");
const ZIP_PATH = process.env.EXTENSION_ZIP_PATH || "ImageVault.zip";

async function getAccessToken() {
  const res = await axios.post(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  );
  return res.data.access_token;
}

async function uploadAndPublish() {
  const accessToken = await getAccessToken();
  const zip = fs.readFileSync(ZIP_PATH);

  const uploadRes = await axios.put(
    `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}`,
    zip,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-goog-api-version": 2,
        "Content-Type": "application/zip",
      },
    }
  );
  console.log("Upload complete:", uploadRes.data);

  const publishRes = await axios.post(
    `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-goog-api-version": 2,
      },
    }
  );
  console.log("Publish complete:", publishRes.data);
}

uploadAndPublish().catch(err => console.error("Automation failed:", err.response?.data || err));