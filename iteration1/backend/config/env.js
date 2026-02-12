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

  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT,
    DB_STRING: process.env.DB_STRING,
    SESSION_SECRET: process.env.SESSION_SECRET || 'dev-only-session-secret'
  };
}

module.exports = validateEnv();
