const mongoose = require('mongoose');
const validator = require('validator');
const { normalizeEmail } = require('../utils/userIdentifiers');

function isHtmlRequest(req) {
  return (req.get('accept') || '').toLowerCase().includes('text/html');
}

function validationError(req, res, status, message) {
  if (isHtmlRequest(req)) {
    req.flash('errors', [{ msg: message }]);
    return res.status(status).redirect(req.get('Referrer') || req.get('Referer') || '/');
  }

  return res.status(status).json({ error: message });
}

function requireFields(fields) {
  return function requireFieldsMiddleware(req, res, next) {
    for (const field of fields) {
      const value = req.body?.[field];
      if (value === undefined || value === null || String(value).trim() === '') {
        return validationError(req, res, 400, `Missing required field: ${field}`);
      }
    }
    return next();
  };
}

function validateEmailField(field) {
  return function validateEmailFieldMiddleware(req, res, next) {
    const value = req.body?.[field];
    if (!value || !validator.isEmail(String(value))) {
      return validationError(req, res, 400, `Invalid email field: ${field}`);
    }
    req.body[field] = normalizeEmail(String(value));
    return next();
  };
}

function validateObjectIdParam(paramName) {
  return function validateObjectIdParamMiddleware(req, res, next) {
    const value = req.params?.[paramName];
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return validationError(req, res, 400, `Invalid id parameter: ${paramName}`);
    }
    return next();
  };
}

function rejectMongoOperators(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const stack = [req.body];

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;

    for (const key of Object.keys(current)) {
      if (key.includes('$') || key.includes('.')) {
        return validationError(req, res, 400, 'Invalid payload keys.');
      }

      const child = current[key];
      if (child && typeof child === 'object') {
        stack.push(child);
      }
    }
  }

  return next();
}

module.exports = {
  requireFields,
  validateEmailField,
  validateObjectIdParam,
  rejectMongoOperators,
  validationError,
  isHtmlRequest
};
