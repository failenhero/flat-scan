# flats-scan

Watcher for new rental flats in **Gernsheim am Rhein** (64579), **Biebesheim am Rhein** (64584),
**Stockstadt am Rhein** (64589) and **Biblis** (68647) on
<https://bgried.de/unsere-angebote/>. Every 5 minutes it polls the underlying
listings source, detects newly-appeared flats there, and emails them to an
inbox of your choice via Brevo SMTP.

See [`docs/superpowers/specs/2026-05-09-flats-scan-design.md`](docs/superpowers/specs/2026-05-09-flats-scan-design.md)
for the full design and [`docs/superpowers/plans/2026-05-09-flats-scan.md`](docs/superpowers/plans/2026-05-09-flats-scan.md)
for the implementation plan.

## How it works

The `bgried.de` offers page embeds an iframe pointing at
`https://bgr.immomio.online/`, a WordPress + WP-ImmoMakler site that
server-renders all listings as HTML. Each listing has a stable UUID. The app:

1. **fetches** that page (30s timeout, one retry),
2. **parses** the listings out of the HTML,
3. **filters** to postal codes 64579 (Gernsheim — not the "Gernsheimer Straße"
   head office in Groß-Gerau), 64584 (Biebesheim), 64589 (Stockstadt) and
   68647 (Biblis),
4. **diffs** against the UUIDs it has already seen (stored in `state/state.json`),
5. **emails** one message per genuinely new listing,
6. **writes a heartbeat** file that the Docker healthcheck watches.

The **first run is silent**: it records whatever matching listings exist right
now as a baseline and sends nothing. Only listings that appear *after* that
trigger an email.

## Quick start (local development)

```bash
npm install
npm test        # 47 tests
```

## Email sending (Brevo)

The app sends through [Brevo](https://www.brevo.com)'s SMTP relay — a free
transactional-email service (300 emails/day). It only ever *sends*; it has no
access to any personal mailbox.

One-time setup:

1. Sign up at <https://www.brevo.com> (free "Starter" plan).
2. **Verify a sender:** Settings → *Senders, Domains & Dedicated IPs* → *Senders*
   → add and confirm an address you control. This becomes `MAIL_FROM`.
3. **Get SMTP credentials:** top-right account menu → *SMTP & API* → *SMTP* tab.
   - `SMTP_USER` = the **Login** shown there (looks like `xxxxxx001@smtp-brevo.com`).
   - `SMTP_PASS` = click **Generate a new SMTP key** and copy it (shown once).

> Note: if `MAIL_FROM` is a freemail address (e.g. `@gmail.com`), Brevo shows a
> "freemail domain is not recommended" notice and the first email may land in
> the recipient's spam folder once — mark it "not spam" and later mail arrives
> normally. For best deliverability, verify your own domain in Brevo.

## Configuration

All configuration is via environment variables, supplied through a `.env` file.
Copy the template and fill it in:

```bash
cp .env.example .env
$EDITOR .env
chmod 600 .env
```

| Variable | Required | Meaning |
|---|---|---|
| `SMTP_HOST` | yes | `smtp-relay.brevo.com` |
| `SMTP_PORT` | yes | `465` (implicit TLS) |
| `SMTP_USER` | yes | Brevo SMTP **Login** |
| `SMTP_PASS` | yes | Brevo SMTP **key** |
| `MAIL_FROM` | yes | a sender you verified in Brevo |
| `MAIL_TO` | yes | where alerts are delivered (any inbox) |
| `SOURCE_URL` | yes | `https://bgr.immomio.online/` |
| `POLL_INTERVAL_MS` | no (default 300000) | poll interval in ms (5 min) |
| `CONTACT_EMAIL` | no | added to the outbound User-Agent |
| `STATE_PATH` | no (default `/data/state.json`) | seen-UUID store |
| `HEARTBEAT_PATH` | no (default `/data/last-tick`) | healthcheck heartbeat |

`.env` is git-ignored — it is never committed.

## Deploy on a Hetzner host

Prereq: Docker + the compose plugin.

```bash
# one-time on the server, only if Docker isn't already there
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# per deploy
mkdir -p ~/apps/flats-scan && cd ~/apps/flats-scan
rsync -a --delete <laptop-path>/ ./     # transfer code (excludes .env via rsync if you prefer)
cp .env.example .env
$EDITOR .env                            # paste real Brevo creds + MAIL_TO
chmod 600 .env
mkdir -p state
docker compose up -d --build
docker compose logs -f flats-scan       # watch first run; ctrl-c to detach
```

Hetzner blocks outbound port 25, but Brevo uses **465**, which is open.

Expected first-run log:

```
startup interval=300000ms source=https://bgr.immomio.online/
fetch ok bytes=...
parsed listings=N gernsheim=0
state load seen=0 firstRun
diff new=0
bootstrap baseline=0
tick ok
```

## Upgrade

```bash
cd ~/apps/flats-scan
rsync -a --delete <laptop-path>/ ./
docker compose up -d --build            # state volume preserved
```

## Operator commands

| Question | Command |
|---|---|
| Is it running? | `docker compose ps` |
| Recent logs? | `docker compose logs --tail 100 flats-scan` |
| Which UUIDs are remembered? | `cat state/state.json` |
| When did it last successfully tick? | `stat state/last-tick` |
| Is the healthcheck happy? | `docker inspect --format='{{.State.Health.Status}}' flats-scan` |
| Force a re-baseline | `rm state/state.json && docker compose restart flats-scan` |
| Reset everything | `docker compose down && rm -rf state && docker compose up -d --build` |

## Rotating the SMTP key

If the key is ever exposed, generate a new one in Brevo (*SMTP & API* → *SMTP*),
delete the old key, update `SMTP_PASS` in `.env`, and
`docker compose up -d` to restart with the new value.
