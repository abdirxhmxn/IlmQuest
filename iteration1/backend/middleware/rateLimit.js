const rateLimit = require('express-rate-limit');

function isHtmlRequest(req) {
  return (req.get('accept') || '').toLowerCase().includes('text/html');
}

function makeLimiter({ windowMs, max, keyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) => {
      const msg = 'Too many requests. Please try again shortly.';
      if (isHtmlRequest(req)) {
        req.flash('errors', [{ msg }]);
        return res.status(429).redirect(req.get('Referrer') || req.get('Referer') || '/');
      }

      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
  });
}

const loginLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const signupLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const recoveryLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const resetLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

module.exports = {
  loginLimiter,
  signupLimiter,
  recoveryLimiter,
  resetLimiter
};
