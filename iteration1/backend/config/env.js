const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '.env') });

function requireEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readFirstEnv(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim() !== '') {
      return {
        key,
        value: String(value).trim()
      };
    }
  }
  return { key: null, value: '' };
}

function validateEnv() {
  requireEnv('DB_STRING');

  if (!process.env.PORT || String(process.env.PORT).trim() === '') {
    process.env.PORT = '2121';
  }

  const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';
  const resolvedSessionSecret = readFirstEnv(['SESSION_SECRET', 'SESSION_SECRET_KEY']);
  let sessionSecret = resolvedSessionSecret.value;

  if (!sessionSecret) {
    if (isProduction) {
      throw new Error(
        'Missing required environment variable: SESSION_SECRET. ' +
        'Set SESSION_SECRET (or legacy SESSION_SECRET_KEY) in your deployment environment ' +
        '(for Render: Service > Environment).'
      );
    }
    sessionSecret = crypto.randomBytes(48).toString('hex');
    console.warn('[env] SESSION_SECRET is not set. Using an ephemeral development secret.');
  } else if (resolvedSessionSecret.key !== 'SESSION_SECRET') {
    // Normalize legacy alias into the canonical runtime key for consumers.
    process.env.SESSION_SECRET = sessionSecret;
    console.warn(
      `[env] Using ${resolvedSessionSecret.key} as session secret source. ` +
      'Rename it to SESSION_SECRET to remove this warning.'
    );
  }

  const appBaseUrl = String(process.env.APP_BASE_URL || '').trim();

  return {
    NODE_ENV: nodeEnv,
    PORT: process.env.PORT,
    DB_STRING: process.env.DB_STRING,
    SESSION_SECRET: sessionSecret,
    APP_BASE_URL: appBaseUrl || null,
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_SERVICE: process.env.SMTP_SERVICE || '',
    SMTP_PORT: process.env.SMTP_PORT || '',
    SMTP_SECURE: process.env.SMTP_SECURE || '',
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || '',
    ALLOW_TENANT_ADMIN_SCHOOL_CREATION: process.env.ALLOW_TENANT_ADMIN_SCHOOL_CREATION || 'false',
    ADMIN_ANALYTICS_CACHE_TTL_MS: process.env.ADMIN_ANALYTICS_CACHE_TTL_MS || '30000',
    PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID || '',
    PLAID_SECRET: process.env.PLAID_SECRET || '',
    PLAID_ENV: process.env.PLAID_ENV || 'sandbox',
    PLAID_REDIRECT_URI: process.env.PLAID_REDIRECT_URI || '',
    PLAID_WEBHOOK_URL: process.env.PLAID_WEBHOOK_URL || '',
    PLAID_PRODUCTS: process.env.PLAID_PRODUCTS || 'transactions',
    FINANCE_ENCRYPTION_KEY: process.env.FINANCE_ENCRYPTION_KEY || ''
  };
}

module.exports = validateEnv();
