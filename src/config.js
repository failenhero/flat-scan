const REQUIRED = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'MAIL_TO',
  'SOURCE_URL',
];

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SMTP_PORT: "${env.SMTP_PORT}" (must be an integer 1-65535)`);
  }

  return {
    smtp: {
      host: env.SMTP_HOST,
      port,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    mail: {
      from: env.MAIL_FROM,
      to: env.MAIL_TO,
    },
    sourceUrl: env.SOURCE_URL,
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 300_000),
    statePath: env.STATE_PATH ?? '/data/state.json',
    heartbeatPath: env.HEARTBEAT_PATH ?? '/data/last-tick',
    contactEmail: env.CONTACT_EMAIL ?? '',
  };
}
