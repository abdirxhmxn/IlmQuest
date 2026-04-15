/* eslint-disable no-console */
const { requireRole } = require('../middleware/auth');

function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      payload: null,
      redirectedTo: null,
      flashMessages: [],
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.payload = body;
        resolve({ statusCode: this.statusCode, payload: body, redirectedTo: this.redirectedTo });
      },
      redirect(path) {
        this.redirectedTo = path;
        resolve({ statusCode: this.statusCode, payload: this.payload, redirectedTo: path });
      }
    };

    req.get = (header) => {
      if (header.toLowerCase() === 'accept') return 'application/json';
      return '';
    };
    req.flash = (_type, msgs) => {
      res.flashMessages.push(msgs);
    };

    mw(req, res, () => resolve({ statusCode: 200, payload: null, redirectedTo: null, nextCalled: true }));
  });
}

async function main() {
  const adminOnly = requireRole('admin');

  const studentReq = {
    user: { _id: 'student-1', role: 'student', schoolId: 'school-1' },
    schoolId: 'school-1',
    ip: '127.0.0.1'
  };

  const adminReq = {
    user: { _id: 'admin-1', role: 'admin', schoolId: 'school-1' },
    schoolId: 'school-1',
    ip: '127.0.0.1'
  };

  const denied = await runMiddleware(adminOnly, studentReq);
  if (denied.statusCode !== 403) {
    throw new Error(`Expected student access denial with 403, got ${denied.statusCode}`);
  }

  const allowed = await runMiddleware(adminOnly, adminReq);
  if (!allowed.nextCalled) {
    throw new Error('Expected admin to pass role middleware.');
  }

  console.log('Role authorization check passed.');
}

main().catch((err) => {
  console.error('Role authorization check failed:', err.message);
  process.exit(1);
});
