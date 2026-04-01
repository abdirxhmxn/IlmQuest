const PLAID_BASE_URLS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com"
};

function getPlaidEnv() {
  const env = String(process.env.PLAID_ENV || "sandbox").trim().toLowerCase();
  if (env === "production") return "production";
  if (env === "development") return "development";
  return "sandbox";
}

function getPlaidBaseUrl() {
  return PLAID_BASE_URLS[getPlaidEnv()] || PLAID_BASE_URLS.sandbox;
}

function getPlaidConfig() {
  const clientId = String(process.env.PLAID_CLIENT_ID || "").trim();
  const secret = String(process.env.PLAID_SECRET || "").trim();
  const redirectUri = String(process.env.PLAID_REDIRECT_URI || "").trim();
  const webhookUrl = String(process.env.PLAID_WEBHOOK_URL || "").trim();
  const products = String(process.env.PLAID_PRODUCTS || "transactions")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    clientId,
    secret,
    redirectUri: redirectUri || null,
    webhookUrl: webhookUrl || null,
    products: products.length ? products : ["transactions"],
    env: getPlaidEnv(),
    baseUrl: getPlaidBaseUrl()
  };
}

function isConfigured() {
  const cfg = getPlaidConfig();
  return Boolean(cfg.clientId && cfg.secret);
}

function safeConfigSummary() {
  const cfg = getPlaidConfig();
  return {
    configured: Boolean(cfg.clientId && cfg.secret),
    env: cfg.env,
    products: cfg.products,
    redirectUriConfigured: Boolean(cfg.redirectUri),
    webhookConfigured: Boolean(cfg.webhookUrl)
  };
}

async function plaidRequest(path, payload) {
  const cfg = getPlaidConfig();
  if (!cfg.clientId || !cfg.secret) {
    const err = new Error("Bank provider credentials are not configured.");
    err.code = "BANK_PROVIDER_NOT_CONFIGURED";
    throw err;
  }

  const response = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: cfg.clientId,
      secret: cfg.secret,
      ...payload
    })
  });

  const rawText = await response.text();
  let parsed = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch (_err) {
    parsed = {};
  }

  if (!response.ok || parsed?.error_code) {
    const err = new Error(parsed?.error_message || "Bank provider request failed.");
    err.code = parsed?.error_code || "BANK_PROVIDER_REQUEST_FAILED";
    err.status = response.status;
    err.type = parsed?.error_type || "provider_error";
    err.display_message = parsed?.display_message || "";
    err.request_id = parsed?.request_id || "";
    throw err;
  }

  return parsed;
}

async function createLinkToken({ clientUserId, legalName }) {
  const cfg = getPlaidConfig();
  const payload = {
    user: {
      client_user_id: String(clientUserId || "unknown-user")
    },
    client_name: "IlmQuest",
    products: cfg.products,
    country_codes: ["US"],
    language: "en"
  };

  if (cfg.redirectUri) payload.redirect_uri = cfg.redirectUri;
  if (cfg.webhookUrl) payload.webhook = cfg.webhookUrl;

  if (legalName) {
    payload.user.legal_name = String(legalName);
  }

  return plaidRequest("/link/token/create", payload);
}

async function exchangePublicToken(publicToken) {
  return plaidRequest("/item/public_token/exchange", {
    public_token: String(publicToken || "")
  });
}

async function getAccounts(accessToken) {
  return plaidRequest("/accounts/get", {
    access_token: String(accessToken || "")
  });
}

async function syncTransactions({ accessToken, cursor = "" }) {
  const response = await plaidRequest("/transactions/sync", {
    access_token: String(accessToken || ""),
    cursor: String(cursor || ""),
    count: 100
  });

  return {
    added: Array.isArray(response.added) ? response.added : [],
    modified: Array.isArray(response.modified) ? response.modified : [],
    removed: Array.isArray(response.removed) ? response.removed : [],
    nextCursor: String(response.next_cursor || ""),
    hasMore: Boolean(response.has_more),
    requestId: String(response.request_id || "")
  };
}

module.exports = {
  getPlaidConfig,
  safeConfigSummary,
  isConfigured,
  createLinkToken,
  exchangePublicToken,
  getAccounts,
  syncTransactions
};
