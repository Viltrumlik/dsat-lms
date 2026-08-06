# Deploying SATFergana

One Ubuntu box, Docker Compose, Nginx terminating TLS. Everything reads from a
single `.env` at the repo root.

## First deploy

```bash
git clone git@github.com:Viltrumlik/dsat-lms.git && cd dsat-lms
cp .env.example .env && $EDITOR .env      # see "What must be set" below
```

Get a certificate before the first `up` — Nginx will not start without one:

```bash
docker run --rm -p 80:80 \
  -v dsat-lms_certbot_conf:/etc/letsencrypt \
  -v dsat-lms_certbot_www:/var/www/certbot \
  certbot/certbot certonly --standalone \
  -d app.yourdomain.com --cert-name satfergana \
  --agree-tos -m you@yourdomain.com --no-eff-email
```

Then:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec web python manage.py createsuperuser
```

## What must be set

The stack refuses to start without these — deliberately, because a default
would be a password everyone shares:

| Variable | Why |
|---|---|
| `DJANGO_SECRET_KEY` | Signs sessions **and keys the verification-code hashes**. Changing it invalidates every code in flight. |
| `POSTGRES_PASSWORD` | — |
| `DJANGO_ALLOWED_HOSTS` | Your domain. Not `*`. |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` | Baked into the frontend **at build time**. Changing them needs a rebuild, not a restart. |
| `NUM_PROXIES=1` | Behind Nginx. At `0` the throttles key on Nginx's own IP and every user shares one bucket. |

Generate a key with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

## Every deploy

```bash
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

Migrations run as their own unit, never in the web container's start command:
two replicas both migrating on boot is a race, and a failed migration should
stop the deploy rather than crash-loop a container that was serving fine.

## Checking it worked

```bash
curl -fsS https://app.yourdomain.com/healthz   # process alive
curl -fsS https://app.yourdomain.com/readyz    # DB + cache reachable
```

`/healthz` is the **liveness** probe and touches nothing — a database blip must
not restart every web container. `/readyz` is the **readiness** probe and is
what the load balancer should watch; it 503s to take one instance out of the
pool without killing it.

Before any deploy, this must be silent:

```bash
docker compose -f docker-compose.prod.yml run --rm web python manage.py check --deploy
```

## Scaling knobs

- `GUNICORN_WORKERS` — 2×CPU+1 by default. **Every worker holds its own
  persistent Postgres connection** (`CONN_MAX_AGE=60`), so
  `workers × replicas` must stay under `max_connections`. Add PgBouncer before
  you add workers past that.
- `CELERY_CONCURRENCY` — worker processes for the general queues. Beat must stay
  at **exactly one replica**: two schedulers means every periodic task fires
  twice, which means two reminder emails and two rollups.
- `CELERY_EMAIL_CONCURRENCY` — the separate `worker-email` service. Email has its
  own worker so a verification code never queues behind a nightly rollup: one
  student is waiting on a form, the other job is not waiting on anyone. Volume is
  bounded by the mailer's quotas, not by this.
- `REDIS_MAXMEMORY` — Redis is both cache and broker, with
  `maxmemory-policy noeviction` so a full instance refuses writes rather than
  silently dropping a queued email.

## Backups

The `backup` service dumps the database on a loop (daily by default) into the
`backups` volume, keeping `BACKUP_RETENTION_DAYS` (14) of history. It writes to a
`.partial` name and only renames on success, so a crashed dump never leaves a
truncated file that looks fine in `ls`; and it prunes only after a good dump, so
a week of failures cannot quietly delete everything you have.

```bash
docker compose -f docker-compose.prod.yml logs backup | tail -20   # did it run?
docker compose -f docker-compose.prod.yml run --rm backup /usr/local/bin/backup.sh   # now
```

Copy them off the box — a backup on the same disk as the database is not a
backup:

```bash
docker run --rm -v dsat-lms_backups:/b -v "$PWD:/out" alpine \
  sh -c 'cp /b/backup-*.sql.gz /out/'
```

**Restore** (write this down before you need it):

```bash
gunzip -c backup-<stamp>.sql.gz | docker compose -f docker-compose.prod.yml \
  exec -T postgres psql -U dsat -d dsat_db
```

Test a restore into a scratch database once, on a day when nothing is wrong. An
untested backup is a hypothesis.

Media lives in the `media_data` volume in a self-hosted setup, or in R2 when
`STORAGE_BACKEND=r2` (the default in production settings). R2 objects are
**private**, served through short-lived presigned URLs — do not make the bucket
public to "fix" a broken image.

## Renewing TLS

```bash
docker run --rm \
  -v dsat-lms_certbot_conf:/etc/letsencrypt \
  -v dsat-lms_certbot_www:/var/www/certbot \
  certbot/certbot renew --webroot -w /var/www/certbot
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```
