const test = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.SECURITY_TEST_BASE_URL || 'http://127.0.0.1:8880';

async function postWithoutCsrf(path, body = '') {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
    });
  } catch (err) {
    throw new Error(`Server not reachable at ${BASE_URL}. Start the app first. (${err.message})`);
  }
}

test('CSRF blocks unauthenticated login mutation without token', async () => {
  const response = await postWithoutCsrf('/login', 'email=test%40example.com&password=badpass');
  assert.equal(response.status, 403);
});

test('CSRF blocks admin create mutation without token', async () => {
  const response = await postWithoutCsrf('/admin/students/add', 'firstName=A&lastName=B');
  assert.equal(response.status, 403);
});

test('CSRF blocks admin delete mutation without token', async () => {
  const response = await postWithoutCsrf('/admin/users/000000000000000000000000?_method=DELETE');
  assert.equal(response.status, 403);
});

test('CSRF blocks teacher create mutation without token', async () => {
  const response = await postWithoutCsrf('/teacher/manage-missions/create-mission', 'missionTitle=x');
  assert.equal(response.status, 403);
});

test('CSRF blocks student mission mutation without token', async () => {
  const response = await postWithoutCsrf('/student/missions/begin?_method=PUT', 'missionId=000000000000000000000000');
  assert.equal(response.status, 403);
});