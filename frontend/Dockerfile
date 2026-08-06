# DSAT LMS v2 — Frontend production image
# Domain: Deploy
#
# Three stages. The point of the last one is that it contains a built app and a
# node runtime and nothing else: no source, no dev dependencies, no npm cache.

# ─────────────────────────────────────
# Stage 1 — dependencies
# ─────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# package-lock.json only, so this layer is cached until a dependency actually
# changes — a source edit must not reinstall the world.
COPY package.json package-lock.json ./
RUN npm ci

# ─────────────────────────────────────
# Stage 2 — build
# ─────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* are inlined at BUILD time — they are not read at runtime, so an
# image built for one environment cannot be pointed at another by changing env.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_DESMOS_API_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_DESMOS_API_KEY=$NEXT_PUBLIC_DESMOS_API_KEY \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─────────────────────────────────────
# Stage 3 — runtime
# ─────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN addgroup -g 10001 -S app && adduser -u 10001 -S app -G app

# The standalone output already carries the server and its real dependencies;
# static/ and public/ are copied beside it because standalone does not include
# assets it expects to be served by a CDN or the process itself.
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
