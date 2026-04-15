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

function tenantUserKey(req) {
  const schoolId = req.schoolId || req.user?.schoolId || "no-school";
  const userId = req.user?._id || req.ip || "anonymous";
  return `${schoolId}:${userId}`;
}

function platformUserKey(req) {
  return String(req.user?._id || req.ip || "anonymous");
}

const loginLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const signupLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const recoveryLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const resetLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const adminMutationLimiter = makeLimiter({ windowMs: 60 * 1000, max: 120, keyGenerator: tenantUserKey });
const reportGenerationLimiter = makeLimiter({ windowMs: 10 * 60 * 1000, max: 40, keyGenerator: tenantUserKey });
const financeSyncLimiter = makeLimiter({ windowMs: 5 * 60 * 1000, max: 20, keyGenerator: tenantUserKey });
const platformProvisionLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 30, keyGenerator: platformUserKey });

module.exports = {
  loginLimiter,
  signupLimiter,
  recoveryLimiter,
  resetLimiter,
  adminMutationLimiter,
  reportGenerationLimiter,
  financeSyncLimiter,
  platformProvisionLimiter
};
