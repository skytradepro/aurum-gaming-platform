# One image for the API, the website and the migration job (different commands in docker-compose.yml).
FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/ledger/package.json packages/ledger/package.json
COPY packages/money/package.json packages/money/package.json
COPY packages/shared/package.json packages/shared/package.json
# The root package.json lists a Windows-only Next.js binary; --force lets Linux install past it.
RUN npm ci --force

COPY . .

# next.config.mjs reads API_INTERNAL_URL while building, so it must be set here.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
RUN npm run web:build

ENV NODE_ENV=production
