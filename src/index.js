import { loadConfig } from './config.js';
import { fetchHtml } from './fetcher.js';
import { parse } from './parser.js';
import { gernsheimOnly } from './filter.js';
import { load as loadState, save as saveState } from './state.js';
import { buildTransporter, buildEmail, send as sendMail } from './mailer.js';
import { touch as touchHeartbeat } from './heartbeat.js';

export async function check(deps) {
  const {
    config,
    fetchFn = (url, opts) => fetchHtml(url, opts),
    parseFn = parse,
    filterFn = gernsheimOnly,
    loadStateFn = loadState,
    saveStateFn = saveState,
    mailerFn,
    heartbeatFn = touchHeartbeat,
    log = console,
  } = deps;

  let html;
  try {
    html = await fetchFn(config.sourceUrl, { contactEmail: config.contactEmail });
    log.log(`fetch ok bytes=${html.length}`);
  } catch (err) {
    log.error(`fetch error: ${err.message}`);
    return;
  }

  const result = parseFn(html);
  if (result === null) {
    log.error('parse error: layout regression suspected');
    return;
  }
  const allListings = result.listings;
  const gernsheim = filterFn(allListings);
  log.log(`parsed listings=${allListings.length} gernsheim=${gernsheim.length}`);

  const { seen, isFirstRun } = await loadStateFn(config.statePath);
  log.log(`state load seen=${seen.size}${isFirstRun ? ' firstRun' : ''}`);

  const newOnes = gernsheim
    .filter((l) => !seen.has(l.uuid))
    .sort((a, b) => a.uuid.localeCompare(b.uuid));
  log.log(`diff new=${newOnes.length}`);

  if (isFirstRun) {
    for (const l of gernsheim) seen.add(l.uuid);
    await saveStateFn(config.statePath, seen);
    log.log(`bootstrap baseline=${gernsheim.length}`);
  } else {
    for (const l of newOnes) {
      try {
        await mailerFn(l);
      } catch (err) {
        log.error(`mail error uuid=${l.uuid}: ${err.message}`);
        continue;
      }
      seen.add(l.uuid);
      try {
        await saveStateFn(config.statePath, seen);
        log.log(`mail sent uuid=${l.uuid}`);
      } catch (err) {
        log.error(`state save error after mail uuid=${l.uuid}: ${err.message}`);
      }
    }
  }

  await heartbeatFn(config.heartbeatPath);
  log.log('tick ok');
}

export async function main() {
  const config = loadConfig();
  const transporter = buildTransporter(config.smtp);
  const mailerFn = async (listing) => {
    const { subject, html, text } = buildEmail(listing);
    await sendMail(transporter, {
      from: config.mail.from,
      to: config.mail.to,
      subject,
      html,
      text,
    });
  };
  const deps = { config, mailerFn };

  console.log(`startup interval=${config.pollIntervalMs}ms source=${config.sourceUrl}`);
  await check(deps);
  setInterval(() => {
    check(deps).catch((err) => console.error(`unhandled tick error: ${err.message}`));
  }, config.pollIntervalMs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`fatal: ${err.message}`);
    process.exit(1);
  });
}
