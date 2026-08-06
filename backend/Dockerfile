# DSAT LMS v2 — Backend production image
# Domain: Deploy
#
# Two stages so the build toolchain (gcc, headers for psycopg) never reaches the
# running container: it is weight nobody needs and a compiler an attacker would
# be glad to find.

# ─────────────────────────────────────
# Stage 1 — build the wheels
# ─────────────────────────────────────
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements/ requirements/
RUN pip wheel --wheel-dir /wheels -r requirements/production.txt

# ─────────────────────────────────────
# Stage 2 — the runtime
# ─────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

# libpq5 is the client library psycopg needs at RUN time; curl is for the
# container healthcheck below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Never root. A container that is compromised should not also be privileged.
RUN useradd --create-home --uid 10001 app
WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements/ requirements/
RUN pip install --no-index --find-links=/wheels -r requirements/production.txt \
    && rm -rf /wheels

COPY --chown=app:app . .

# Collected at BUILD time, not on boot: an image that has to reach the network
# to become servable is an image that fails to start on a bad day. The dummy
# values exist only because collectstatic imports settings, which reads env.
RUN DJANGO_SECRET_KEY=build-only \
    DATABASE_URL=postgres://u:p@localhost/db \
    R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET_NAME=x R2_ACCOUNT_ID=x \
    python manage.py collectstatic --noinput \
    && chown -R app:app /app/staticfiles

USER app
EXPOSE 8000

# Liveness only — readiness (database, cache) is the load balancer's job, and a
# container must not restart itself because Postgres blinked.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/healthz || exit 1

CMD ["gunicorn", "config.wsgi:application", "--config", "gunicorn.conf.py"]
