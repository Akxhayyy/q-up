# ---------- Dependencies ----------
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


# ---------- Build ----------
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client
RUN npx prisma generate

# Next.js evaluates API modules during build.
# A placeholder is enough because the real DATABASE_URL
# is supplied when the container starts.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

# Build Next.js
RUN npm run build


# ---------- Production ----------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma7.config.ts ./prisma7.config.ts
COPY --from=builder /app/app/generated ./app/generated
COPY --from=builder /app/next.config.* ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]