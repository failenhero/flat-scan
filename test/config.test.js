import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const validEnv = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
  SMTP_USER: 'me@gmail.com',
  SMTP_PASS: 'app-password-1234',
  MAIL_FROM: 'me@gmail.com',
  MAIL_TO: 'you@protonmail.com',
  SOURCE_URL: 'https://bgr.immomio.online/',
};

test('loadConfig returns parsed config when all required vars are present', () => {
  const cfg = loadConfig(validEnv);
  assert.equal(cfg.smtp.host, 'smtp.gmail.com');
  assert.equal(cfg.smtp.port, 465);
  assert.equal(cfg.smtp.user, 'me@gmail.com');
  assert.equal(cfg.smtp.pass, 'app-password-1234');
  assert.equal(cfg.mail.from, 'me@gmail.com');
  assert.equal(cfg.mail.to, 'you@protonmail.com');
  assert.equal(cfg.sourceUrl, 'https://bgr.immomio.online/');
});

test('loadConfig applies defaults for optional vars', () => {
  const cfg = loadConfig(validEnv);
  assert.equal(cfg.pollIntervalMs, 300_000);
  assert.equal(cfg.statePath, '/data/state.json');
  assert.equal(cfg.heartbeatPath, '/data/last-tick');
  assert.equal(cfg.contactEmail, '');
});

test('loadConfig honours optional overrides', () => {
  const cfg = loadConfig({
    ...validEnv,
    POLL_INTERVAL_MS: '60000',
    STATE_PATH: '/tmp/state.json',
    HEARTBEAT_PATH: '/tmp/last-tick',
    CONTACT_EMAIL: 'contact@example.com',
  });
  assert.equal(cfg.pollIntervalMs, 60_000);
  assert.equal(cfg.statePath, '/tmp/state.json');
  assert.equal(cfg.heartbeatPath, '/tmp/last-tick');
  assert.equal(cfg.contactEmail, 'contact@example.com');
});

test('loadConfig throws when a required var is missing', () => {
  const { SMTP_PASS, ...incomplete } = validEnv;
  assert.throws(() => loadConfig(incomplete), /SMTP_PASS/);
});

test('loadConfig throws listing all missing vars', () => {
  assert.throws(
    () => loadConfig({ SMTP_HOST: 'smtp.gmail.com' }),
    /SMTP_PORT.*SMTP_USER/s,
  );
});

test('loadConfig rejects non-numeric SMTP_PORT', () => {
  assert.throws(
    () => loadConfig({ ...validEnv, SMTP_PORT: 'abc' }),
    /SMTP_PORT.*abc/,
  );
});

test('loadConfig rejects SMTP_PORT out of range', () => {
  assert.throws(
    () => loadConfig({ ...validEnv, SMTP_PORT: '70000' }),
    /SMTP_PORT.*70000/,
  );
});
