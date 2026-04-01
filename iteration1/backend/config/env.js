const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

function requireEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateEnv() {
  requireEnv('DB_STRING');

  if (!process.env.PORT || String(process.env.PORT).trim() === '') {
    process.env.PORT = '2121';
  }

  if (process.env.NODE_ENV === 'production') {
    requireEnv('SESSION_SECRET');
  }

  const appBaseUrl = String(process.env.APP_BASE_URL || '').trim();

  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT,
    DB_STRING: process.env.DB_STRING,
    SESSION_SECRET: process.env.SESSION_SECRET || 'dev-only-session-secret',
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
