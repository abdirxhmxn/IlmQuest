const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const cloudinary = require("cloudinary").v2;

const BACKEND_ENV_PATH = path.resolve(__dirname, "../config/.env");
const PROJECT_ENV_PATH = path.resolve(__dirname, "../../.env");

function readEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    return dotenv.parse(raw);
  } catch (_err) {
    return {};
  }
}

function cleanValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isPlaceholder(value) {
  const normalized = cleanValue(value).toLowerCase();
  if (!normalized) return true;

  const placeholders = new Set([
    "root",
    "your-cloudinary-cloud-name",
    "your-cloudinary-api-key",
    "your-cloudinary-api-secret",
    "your_cloudinary_cloud_name",
    "your_cloudinary_api_key",
    "your_cloudinary_api_secret",
    "changeme",
    "replace-me",
    "placeholder"
  ]);

  if (placeholders.has(normalized)) return true;
  if (normalized.includes("your-cloudinary")) return true;
  if (normalized.includes("placeholder")) return true;
  return false;
}

function maskValue(value, keep = 3) {
  const cleaned = cleanValue(value);
  if (!cleaned) return "<missing>";
  if (cleaned.length <= keep) return `${"*".repeat(cleaned.length)}(${cleaned.length})`;
  return `${cleaned.slice(0, keep)}***(${cleaned.length})`;
}

function parseCloudinaryUrl(value) {
  const raw = cleanValue(value);
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "cloudinary:") return null;

    return {
      cloud_name: cleanValue(parsed.hostname),
      api_key: cleanValue(decodeURIComponent(parsed.username || "")),
      api_secret: cleanValue(decodeURIComponent(parsed.password || ""))
    };
  } catch (_err) {
    return null;
  }
}

function pickBestValue(keys, fileEnv) {
  const candidates = [];

  keys.forEach((key) => {
    candidates.push({
      key,
      source: `process.env.${key}`,
      value: cleanValue(process.env[key])
    });
  });

  keys.forEach((key) => {
    candidates.push({
      key,
      source: `backend/config/.env:${key}`,
      value: cleanValue(fileEnv.backend[key])
    });
  });

  keys.forEach((key) => {
    candidates.push({
      key,
      source: `project/.env:${key}`,
      value: cleanValue(fileEnv.project[key])
    });
  });

  let fallback = null;
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    if (!fallback) fallback = candidate;
    if (!isPlaceholder(candidate.value)) return candidate;
  }
  return fallback;
}

function pickPreferredCandidate(candidates = []) {
  const normalized = candidates.filter((candidate) => candidate && cleanValue(candidate.value));
  for (const candidate of normalized) {
    if (!isPlaceholder(candidate.value)) return candidate;
  }
  return normalized[0] || null;
}

function buildCloudinaryState() {
  const fileEnv = {
    backend: readEnvFile(BACKEND_ENV_PATH),
    project: readEnvFile(PROJECT_ENV_PATH)
  };

  const explicitCloudNameCandidate = pickBestValue(["CLOUDINARY_CLOUD_NAME"], fileEnv);
  const explicitApiKeyCandidate = pickBestValue(["CLOUDINARY_API_KEY"], fileEnv);
  const explicitApiSecretCandidate = pickBestValue(["CLOUDINARY_API_SECRET"], fileEnv);
  const legacyCloudNameCandidate = pickBestValue(["CLOUD_NAME"], fileEnv);
  const legacyApiKeyCandidate = pickBestValue(["API_KEY"], fileEnv);
  const legacyApiSecretCandidate = pickBestValue(["API_SECRET"], fileEnv);
  const cloudinaryUrlCandidate = pickBestValue(["CLOUDINARY_URL"], fileEnv);

  const parsedUrl = parseCloudinaryUrl(cloudinaryUrlCandidate?.value || "");
  const urlCloudNameCandidate = parsedUrl?.cloud_name
    ? { source: `${cloudinaryUrlCandidate?.source || "CLOUDINARY_URL"}#cloud_name`, value: parsedUrl.cloud_name }
    : null;
  const urlApiKeyCandidate = parsedUrl?.api_key
    ? { source: `${cloudinaryUrlCandidate?.source || "CLOUDINARY_URL"}#api_key`, value: parsedUrl.api_key }
    : null;
  const urlApiSecretCandidate = parsedUrl?.api_secret
    ? { source: `${cloudinaryUrlCandidate?.source || "CLOUDINARY_URL"}#api_secret`, value: parsedUrl.api_secret }
    : null;

  const cloudNameResolved = pickPreferredCandidate([
    explicitCloudNameCandidate,
    urlCloudNameCandidate,
    legacyCloudNameCandidate
  ]);
  const apiKeyResolved = pickPreferredCandidate([
    explicitApiKeyCandidate,
    urlApiKeyCandidate,
    legacyApiKeyCandidate
  ]);
  const apiSecretResolved = pickPreferredCandidate([
    explicitApiSecretCandidate,
    urlApiSecretCandidate,
    legacyApiSecretCandidate
  ]);

  const cloudName = cleanValue(cloudNameResolved?.value || "");
  const apiKey = cleanValue(apiKeyResolved?.value || "");
  const apiSecret = cleanValue(apiSecretResolved?.value || "");

  const problems = [];
  if (!cloudName) problems.push("cloud_name_missing");
  if (!apiKey) problems.push("api_key_missing");
  if (!apiSecret) problems.push("api_secret_missing");
  if (isPlaceholder(cloudName)) problems.push("cloud_name_placeholder");
  if (isPlaceholder(apiKey)) problems.push("api_key_placeholder");
  if (isPlaceholder(apiSecret)) problems.push("api_secret_placeholder");

  const ready = problems.length === 0;

  return {
    ready,
    problems,
    config: {
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    },
    sources: {
      cloud_name: cloudNameResolved?.source || "<none>",
      api_key: apiKeyResolved?.source || "<none>",
      api_secret: apiSecretResolved?.source || "<none>"
    },
    summary: {
      cloud_name: maskValue(cloudName),
      api_key: maskValue(apiKey),
      api_secret: maskValue(apiSecret),
      cloudinary_url: cloudinaryUrlCandidate?.value ? maskValue(cloudinaryUrlCandidate.value, 12) : "<missing>"
    }
  };
}

const cloudinaryState = buildCloudinaryState();

if (cloudinaryState.ready) {
  // Keep legacy and explicit env aliases in sync for existing code paths.
  if (isPlaceholder(process.env.CLOUDINARY_CLOUD_NAME)) {
    process.env.CLOUDINARY_CLOUD_NAME = cloudinaryState.config.cloud_name;
  }
  if (isPlaceholder(process.env.CLOUD_NAME)) {
    process.env.CLOUD_NAME = cloudinaryState.config.cloud_name;
  }

  if (isPlaceholder(process.env.CLOUDINARY_API_KEY)) {
    process.env.CLOUDINARY_API_KEY = cloudinaryState.config.api_key;
  }
  if (isPlaceholder(process.env.API_KEY)) {
    process.env.API_KEY = cloudinaryState.config.api_key;
  }

  if (isPlaceholder(process.env.CLOUDINARY_API_SECRET)) {
    process.env.CLOUDINARY_API_SECRET = cloudinaryState.config.api_secret;
  }
  if (isPlaceholder(process.env.API_SECRET)) {
    process.env.API_SECRET = cloudinaryState.config.api_secret;
  }

  cloudinary.config(cloudinaryState.config);
} else {
  // Keep Cloudinary module usable for callers while preventing bad credential usage.
  cloudinary.config({ secure: true });
}

const shouldLogDebug = process.env.CLOUDINARY_DEBUG === "true" || process.env.NODE_ENV !== "production";
if (shouldLogDebug) {
  console.info("[cloudinary] init", {
    ready: cloudinaryState.ready,
    cloud_name: cloudinaryState.summary.cloud_name,
    api_key: cloudinaryState.summary.api_key,
    cloud_name_source: cloudinaryState.sources.cloud_name,
    api_key_source: cloudinaryState.sources.api_key,
    api_secret_source: cloudinaryState.sources.api_secret,
    problems: cloudinaryState.problems
  });
}

cloudinary.isConfigured = () => cloudinaryState.ready;
cloudinary.getSafeDebugSummary = () => ({
  ready: cloudinaryState.ready,
  problems: [...cloudinaryState.problems],
  summary: { ...cloudinaryState.summary },
  sources: { ...cloudinaryState.sources }
});

module.exports = cloudinary;
