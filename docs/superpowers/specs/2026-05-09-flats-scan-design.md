# flats-scan — Gernsheim flat watcher

**Date:** 2026-05-09
**Author:** Yury Okhrimenko (yury.okhrimenko@flexoptix.net)
**Status:** Design

## 1. Goal

Send an email to a Proton Mail inbox whenever a new rental flat in **Gernsheim am Rhein** (postal code 64579) appears on the BGRied housing-cooperative listings.

Source page (user-facing): https://bgried.de/unsere-angebote/

Today the cooperative usually has zero or a handful of Gernsheim listings; new ones appear rarely. The watcher must (a) not miss new listings, (b) not spam duplicates, (c) be cheap to run alongside other small services on a 4 GB Hetzner box.

## 2. Source analysis

The page `https://bgried.de/unsere-angebote/` does **not** itself contain listings — it embeds an iframe pointing at:

> **https://bgr.immomio.online/**

That subdomain runs WordPress with the *WP-ImmoMakler* plugin (v5.21.2) and **server-renders all listings as HTML**. Each listing is a `<div class="property">` containing:

- a permalink with a stable UUID, e.g. `…/immobilien/wohnung-…-22b58dcd-e30b-48d3-8c1b-3dac4de31cbf/`
- `<h3 class="property-title">` with the listing title and link
- an address line in the form `Street N, 64521 Groß-Gerau` (full street + postal code + city)
- a thumbnail `<img>`

The WP REST API exposes `immomakler/v1` with `info`, `cart`, `map/infowindow`, `wp/v2/posts`, `wp/v2/pages` — **none expose listings**. So scraping the rendered HTML is the only available data path.

The page is fully server-rendered (no JS needed), uses standard markup, and has small payload (~70 KB per fetch).

## 3. Architecture

A single Node.js process running inside one Docker container on the Hetzner server:

```
┌─────────────────────────────────────────────────────────┐
│ Docker container (long-running)                          │
│                                                          │
│  src/index.js — boot → run check() → setInterval(check, │
│                                       POLL_INTERVAL_MS)  │
│                                                          │
│  check():                                               │
│    1. fetch HTML from SOURCE_URL                        │
│    2. parse → Listing[]                                 │
│    3. filter to postal code 64579                       │
│    4. load seen UUIDs from state.json                   │
│    5. diff → new[]                                      │
│    6. for each new listing:                             │
│         send email → on success, add UUID to seen,       │
│         atomically rewrite state.json                    │
│    7. update heartbeat file                              │
│                                                          │
│  Volume mount:  ./state  →  /data                        │
│    /data/state.json    — set of seen UUIDs               │
│    /data/last-tick     — heartbeat (mtime = last ok run) │
│                                                          │
│  Restart policy:    unless-stopped                       │
│  Healthcheck:       heartbeat younger than 15 min        │
└─────────────────────────────────────────────────────────┘
```

A long-running daemon model (with `setInterval`) was chosen instead of a oneshot-on-cron because the deployment target is Docker; running cron inside a container is an antipattern and triggering containers from host cron negates the benefit of containerising.

## 4. Configuration via environment variables

All runtime config comes from environment variables; the container has no built-in defaults that would make sense for credentials.

| Variable | Required | Description |
|---|---|---|
| `SMTP_HOST` | yes | `smtp.gmail.com` |
| `SMTP_PORT` | yes | `465` (SMTPS) |
| `SMTP_USER` | yes | sending Gmail address |
| `SMTP_PASS` | yes | 16-char Gmail **App Password** (no spaces) |
| `MAIL_FROM` | yes | usually identical to `SMTP_USER` |
| `MAIL_TO` | yes | Proton recipient address |
| `SOURCE_URL` | yes | `https://bgr.immomio.online/` |
| `POLL_INTERVAL_MS` | no, default `300000` | poll cadence in milliseconds (5 min) |
| `STATE_PATH` | no, default `/data/state.json` | seen-UUIDs file |
| `HEARTBEAT_PATH` | no, default `/data/last-tick` | written on each successful tick |
| `CONTACT_EMAIL` | no | embedded in `User-Agent` so site owner can reach us |

`config.js` reads + validates these on startup and exits with a clear error if a required value is missing — fail fast, do not silently start with broken config.

## 5. Components

```
flats-scan/
├── src/
│   ├── index.js        ← orchestrator: schedule + check() loop
│   ├── fetcher.js      ← HTTP GET → raw HTML string
│   ├── parser.js       ← HTML → Listing[]
│   ├── filter.js       ← Listing[] → only postal code 64579
│   ├── state.js        ← load/save Set<uuid> with atomic write
│   ├── mailer.js       ← send 1 email via Gmail SMTP
│   ├── config.js       ← read & validate env vars
│   └── heartbeat.js    ← touch the heartbeat file
├── test/
│   ├── parser.test.js
│   ├── filter.test.js
│   ├── state.test.js
│   └── fixtures/
│       ├── bgr-immomio-index.html       ← captured 2026-05-09
│       └── bgr-immomio-with-gernsheim.html ← synthetic (1 entry edited to 64579)
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

### 5.1 Module contracts

- **`fetcher.fetch(url, { contactEmail }) → Promise<string>`** — sets `User-Agent: flats-scan/1.0 (+contactEmail)` and `Accept-Language: de`; 30 s `AbortSignal.timeout`; one retry after 2 s on network error or 5xx; throws on non-2xx after retry.
- **`parser.parse(html) → { listings: Listing[] } | null`** — uses cheerio, extracts every `<div class="property">` (or whatever the markup turns out to be after live inspection) and yields `{ uuid, title, address, url, thumbnailUrl }`. Decoupled from URL or filter. Returns `null` when **the listings container itself isn't present** (suspected markup change). Returns `{ listings: [] }` when the container is present but empty (legitimate "no listings right now"). Returns `{ listings: [...] }` when listings are present.
- **`filter.gernsheimOnly(listings) → Listing[]`** — keeps entries whose `address` contains the token `64579` followed by whitespace (`/\b64579\b/`). See §7.
- **`state.load(path) → Promise<{ seen: Set<string>, isFirstRun: boolean }>`** — JSON `{ "seenUuids": [...] }`. `isFirstRun` is `true` only when the file did not exist (distinguishes "never ran here" from "ran before, set happens to be empty"). Missing file → `{ seen: new Set(), isFirstRun: true }`. Present file → `{ seen, isFirstRun: false }`.
- **`state.save(path, set) → Promise<void>`** — JSON `{ "seenUuids": [...] }`. Writes to a temp file and `rename`s for atomicity.
- **`mailer.send({ to, from, subject, html, text }, smtpConfig) → Promise<void>`** — nodemailer with TLS on 465. Throws on send failure.
- **`heartbeat.touch(path) → Promise<void>`** — `fs.utimes` on the heartbeat file (creating it if absent).
- **`config.load() → { smtp, mail, sourceUrl, pollIntervalMs, statePath, heartbeatPath, contactEmail }`** — throws a descriptive error if any required variable is missing.

### 5.2 Dependencies (kept minimal)

- `cheerio` — HTML parsing (the standard choice for Node)
- `nodemailer` — SMTP

That's it. Built-in `fetch` (Node 22) is used directly — no `axios`, no `node-fetch`. No scheduler library — `setInterval` is sufficient. Tests use Node's built-in `node:test` runner — no `jest`/`vitest` dependency.

## 6. Per-tick data flow

`check()` is the only stateful operation, and it runs sequentially:

1. **Fetch** the source HTML (with timeout + 1 retry). On failure, log error and return — heartbeat **not** updated, state untouched.
2. **Parse** to `{ listings } | null`. If `null` (listings container missing), log `parse error: layout regression suspected`, return — heartbeat **not** updated, state untouched.
3. **Filter** the parsed `listings` to Gernsheim-only via postal-code regex.
4. **Load** seen UUIDs and the `isFirstRun` flag from `state.json`.
5. **Diff:** `new = currentGernsheim.filter(l => !seen.has(l.uuid))`.
6. **First-run special case:** if `isFirstRun === true`, do **not** send emails. Save the current Gernsheim set as the baseline. Log `bootstrap baseline=<n>`. Skip step 7.
7. **Otherwise**, for each new listing in deterministic order (sorted by `uuid` for stable ordering):
   - Send the email.
   - On success: `seen.add(uuid)`, atomically rewrite `state.json`.
   - On failure: log error, leave state unchanged, continue with the next listing.
8. **Touch the heartbeat file.** Reached only after successful fetch + parse (steps 1-2 didn't early-return). The heartbeat reflects "the watcher is alive and the source is reachable", not "we sent emails". This is the case for both first-run baseline and normal ticks.

Total wall time per tick: ~1-2 s in the typical case. Far below the 5-min cadence.

## 7. Filter precision (important nuance)

A naïve substring search for "Gernsheim" in the listing address would generate **false positives**. The BG Ried *office* is at:

> Gernsheimer Straße 10, 64521 Groß-Gerau

If a listing's address contains the office's street name (e.g. another property on Gernsheimer Straße in Groß-Gerau), substring matching would misclassify it as a Gernsheim flat.

**The filter matches the postal code 64579** (Gernsheim am Rhein) — unambiguous, structured, future-proof. Specifically the regex `/\b64579\b/` against the parsed address string. Postal codes never have boundary ambiguity.

We do **not** anchor on the city word "Gernsheim" anywhere in the filter. Only the postal code.

## 8. State, idempotency, "near exactly once" semantics

`state.json` shape:
```json
{ "seenUuids": ["22b58dcd-e30b-48d3-8c1b-3dac4de31cbf", "..."] }
```

Rules:

- **Save after every successful email**, not just at the end of a tick. With ~1-3 new listings ever per tick, the cost is negligible and the safety is real.
- **Atomic file write** via temp file + `rename` — eliminates torn writes.
- **Email succeeds + state save fails** → at most one duplicate email next tick. Acceptable given the volume (a few/month).
- **Email fails** → UUID stays unseen → automatically retried next tick. No retry queue, no backoff state.
- **Listings disappearing from the page** is fine — we keep their UUIDs in `seenUuids` forever, so if a listing reappears we won't re-notify. Long-term growth of the file is bounded by the cooperative's lifetime listing count, expected to stay well under a few thousand entries.
- The state file is the single source of truth across container restarts. It's mounted from a host bind volume (`./state`) so a `docker compose down && up --build` preserves it.

## 9. Error handling and logging

| Failure | Detection | Reaction |
|---|---|---|
| Network error / timeout / 5xx fetching source | fetcher throws after retry | log error; skip tick (no state change, no heartbeat) |
| Source returns 4xx | fetcher throws | log error; skip tick |
| Parser returns empty when page bytes > a few KB | `parser.parse` returns `[]` | log error "layout regression suspected"; skip tick |
| One specific email send fails | `mailer.send` rejects | log error; do not mark UUID seen; continue with remaining listings |
| State save fails after successful email | `state.save` rejects | log error; container exits; Docker restarts it |
| Process exception unhandled | `process.on('uncaughtException')` and `unhandledRejection` | log + `process.exit(1)`; Docker restarts container |
| Source down for 24+ hours | heartbeat older than 15 min | Docker `HEALTHCHECK` reports container as unhealthy. **Note:** Docker does *not* auto-restart unhealthy containers by default; this is an observability signal only (visible in `docker compose ps` and `docker inspect`). Restart-on-stuck is unnecessary because the process can't actually get stuck — `setInterval` always fires, fetch is bounded by `AbortSignal.timeout(30_000)`, and each tick is independent. |

**Log format:** plain `console.log` / `console.error` writing one event per line, colon-separated key=value style:

```
2026-05-09T16:42:01Z fetch ok bytes=70862
2026-05-09T16:42:01Z parsed listings=8 gernsheim=0
2026-05-09T16:42:01Z state load seen=12
2026-05-09T16:42:01Z diff new=0
2026-05-09T16:42:01Z tick ok duration_ms=412
```

ISO-8601 timestamps are emitted by the app itself (Docker's `json-file` driver also adds them, but having them in the line text helps when grepping a tarball). Log rotation handled by Docker (`max-size=10m`, `max-file=3`) — set in compose.

## 10. Email format

One email per new listing.

- **Subject:** `Neue Gernsheim-Wohnung: <title>`
- **From:** `MAIL_FROM`
- **To:** `MAIL_TO`
- **HTML body** (kept minimal so it renders well in Proton's web client and mobile):

```html
<p>Eine neue Wohnung in Gernsheim ist verfügbar:</p>
<p><strong>{title}</strong></p>
<p>{address}</p>
<p><a href="{url}">Zum Inserat</a></p>
<p><img src="{thumbnailUrl}" alt="{title}" style="max-width:480px"></p>
```

- **Plain-text alternative** (for clients that block HTML):
```
Eine neue Wohnung in Gernsheim ist verfügbar:

{title}
{address}
{url}
```

The thumbnail is **referenced by URL** (no inline attachment). If the cooperative ever takes the image down, the email still has the link.

## 11. Deployment

### 11.1 `Dockerfile`

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./
ENV NODE_ENV=production
ENV STATE_PATH=/data/state.json
ENV HEARTBEAT_PATH=/data/last-tick
USER node
HEALTHCHECK --interval=2m --timeout=10s --start-period=30s --retries=2 \
  CMD node -e "const f=require('fs');const s=f.statSync(process.env.HEARTBEAT_PATH);if((Date.now()-s.mtimeMs)>15*60*1000)process.exit(1)"
CMD ["node", "src/index.js"]
```

### 11.2 `docker-compose.yml`

```yaml
services:
  flats-scan:
    build: .
    container_name: flats-scan
    restart: unless-stopped
    env_file: .env
    user: "${UID:-1000}:${GID:-1000}"
    volumes:
      - ./state:/data
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

The `user:` override matches the container UID to the host user that owns `./state`. The defaults (`1000:1000`) work on a fresh Ubuntu install where the first non-root user is UID 1000. If your host user is different, set `UID` and `GID` in `.env` (or run `export UID GID` before `docker compose up`).

### 11.3 `.env` (created on the server, never committed)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-sender@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx
MAIL_FROM=your-sender@gmail.com
MAIL_TO=you@protonmail.com
SOURCE_URL=https://bgr.immomio.online/
POLL_INTERVAL_MS=300000
CONTACT_EMAIL=you@protonmail.com
```

### 11.4 Gmail prep (one-time)

1. Sending Gmail account → enable 2-Step Verification.
2. Google Account → Security → "App passwords" → create one labelled "flats-scan".
3. Copy the 16-character string into `SMTP_PASS` (no spaces).

Hetzner blocks outbound port 25 by default; **465 (SMTPS) is open**, which is what we use.

### 11.5 Install runbook

```bash
# one-time on the server, only if Docker isn't already there
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# per deploy
mkdir -p ~/apps/flats-scan && cd ~/apps/flats-scan
rsync -a --delete <laptop-path>/ ./           # transfer code
nano .env                                     # paste SMTP creds, MAIL_TO, etc.
chmod 600 .env
mkdir -p state
docker compose up -d --build
docker compose logs -f flats-scan             # watch first run; ctrl-c to detach
```

The first run logs `bootstrap baseline=N` and sends no emails — current Gernsheim listings (if any) become the baseline.

### 11.6 Upgrade flow

```bash
cd ~/apps/flats-scan
rsync -a --delete <laptop-path>/ ./
docker compose up -d --build                  # state volume preserved
```

### 11.7 Operator commands

| Question | Command |
|---|---|
| Is it running? | `docker compose ps` |
| Recent logs? | `docker compose logs --tail 100 flats-scan` |
| What UUIDs are remembered? | `cat state/state.json` |
| When did it last successfully tick? | `stat state/last-tick` |
| Is the healthcheck happy? | `docker inspect --format='{{.State.Health.Status}}' flats-scan` |
| Force a re-baseline | `rm state/state.json && docker compose restart flats-scan` |
| Reset everything | `docker compose down && rm -rf state && docker compose up -d --build` |

## 12. Out of scope (intentional, v1)

- Source-down email alerts (e.g. "site has been unreachable for 24h"). The Docker healthcheck + log inspection is sufficient. Add later if it becomes painful.
- Persistent retry queue or exponential backoff. The next 5-min tick is the retry.
- Metrics, Prometheus, dashboards.
- Web UI to view state.
- Multi-recipient delivery, per-recipient filters.
- Other cities (Groß-Gerau etc.) — this watcher is Gernsheim-specific by design.
- Push notifications (Telegram, ntfy, etc.) — email only.
- Listing-detail-page enrichment (price, rooms, size, full description). The index card is sufficient.

## 13. Risks and known fragilities

- **Markup change at the source** breaks the parser. Mitigations: (a) parser returns `[]` on missing container → caller treats as failure, doesn't corrupt state; (b) heartbeat goes stale → Docker reports unhealthy; (c) test fixtures snapshot today's HTML so a future fix can be diffed against known-good.
- **Hetzner outbound block on port 25.** Using 465 sidesteps this. If Gmail ever stops accepting app-passwords for SMTP, switch to OAuth2 or to a transactional service (Resend, etc.) — `mailer.js` is the only file that changes.
- **First run after a long downtime** could legitimately email several listings if the cooperative posted multiple Gernsheim flats while the watcher was off. This is intended behaviour and matches user intent.
- **WP-ImmoMakler plugin upgrade** could renumber UUIDs or change permalinks. If permalink format changes, `parser.js` selectors need updating. UUIDs themselves are persistent identifiers in WP-ImmoMakler — unlikely to be reassigned.
- **Politeness:** the watcher identifies itself in `User-Agent` with a contact email; if the site owner ever asks us to slow down or stop, we honour it.

## 14. Open questions (must be resolved before implementation, but none currently outstanding)

None. All decisions are settled in §3-§13.
