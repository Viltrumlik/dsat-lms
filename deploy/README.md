# Deploying SATFergana

One Ubuntu box, Docker Compose, Nginx terminating TLS. Everything reads from a
single `.env` at the repo root.

## First deploy

```bash
git clone git@github.com:Viltrumlik/dsat-lms.git && cd dsat-lms
cp .env.example .env && $EDITOR .env      # see "What must be set" below
```

Nginx will not start without a certificate, so one has to exist first. Which
route depends on whether DNS already points here.

**DNS is live** — take the real certificate straight away, with port 80 free
because Nginx is not running yet:

```bash
docker run --rm -p 80:80 \
  -v dsat-lms_certbot_conf:/etc/letsencrypt \
  -v dsat-lms_certbot_www:/var/www/certbot \
  certbot/certbot certonly --standalone \
  -d yourdomain.com -d www.yourdomain.com --cert-name satfergana \
  --agree-tos -m you@yourdomain.com --no-eff-email
```

**DNS is not live yet** (a fresh domain can take a day) — do not sit and wait.
Put a placeholder in so Nginx starts, and bring the site up behind it:

```bash
docker volume create dsat-lms_certbot_conf
docker run --rm -v dsat-lms_certbot_conf:/etc/letsencrypt alpine \
  mkdir -p /etc/letsencrypt/live/satfergana
docker run --rm -v dsat-lms_certbot_conf:/etc/letsencrypt alpine/openssl \
  req -x509 -nodes -newkey rsa:2048 -days 3 \
  -keyout /etc/letsencrypt/live/satfergana/privkey.pem \
  -out /etc/letsencrypt/live/satfergana/fullchain.pem \
  -subj "/CN=yourdomain.com"
```

Browsers will refuse it, which is correct — it exists so the stack can be
verified end to end (routing, headers, static files) while DNS propagates. When
the domain resolves, swap it for the real one **without stopping Nginx**:

```bash
./deploy/obtain-cert.sh yourdomain.com you@yourdomain.com
```

That uses the webroot Nginx already serves, deletes the placeholder first (or
certbot treats it as a lineage it issued), and refuses to run at all until the
domain resolves to this machine — a request against DNS that has not propagated
just spends one of five hourly attempts Let's Encrypt allows.

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

### If the deploy touched anything under `deploy/`

**Recreate Nginx. A reload is not enough, and it fails silently.**

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
docker compose -f docker-compose.prod.yml exec nginx grep -n "location /" /etc/nginx/conf.d/default.conf
```

The config files are bind-mounted **file by file**, and a file bind mount
follows the inode, not the path. `git pull` does not edit those files in place —
it writes new ones — so the container goes on reading the old inode, which still
exists because the container holds it open. `nginx -s reload` then re-reads the
same stale file and reports success, `nginx -t` passes, and the config you are
looking at on disk is not the config being served.

The second command above is the check: read the config **out of the container**,
not off the disk, and confirm it says what you just committed.

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

Automatic. The `certbot` service renews twice a day and Nginx reloads every six
hours to pick the new file up — certbot cannot signal a process in another
container, and Nginx reads the certificate once at start, so without that reload
the site would expire on schedule with a valid certificate sitting on disk.

Both loops exist because a certificate renewed by a command in a runbook is a
certificate that expires: these last 90 days, so the failure lands a quarter
after the deploy, and it takes the whole site down at once.

Check it is working — long before you need it to have worked:

```bash
docker compose -f docker-compose.prod.yml logs certbot | tail -20
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot certificates
```

`certificates` prints the expiry date. If it is ever inside 30 days and not
moving, renewal is failing silently — check that port 80 still reaches
`/.well-known/acme-challenge/` from outside.
