#

# Multi-stage Dockerfile for Next.js app `essl-dashboard`

# Optimized using Next.js standalone output for a smaller runtime image

#

# Usage:

#   docker build -t aash591/essl-dashboard:v1.0.0 -t aash591/essl-dashboard:latest .

#   docker run -p 3000:3000 --env-file .env.local aash591/essl-dashboard:latest

#



# Base image (Next.js 16 requires Node >= 20.9)

FROM node:22-alpine AS base

LABEL org.opencontainers.image.author="aash591"

WORKDIR /app



# Install dependencies (including dev for building)

FROM base AS deps

ENV NODE_ENV=development

COPY package.json package-lock.json ./

RUN npm ci



# Build the Next.js app with standalone output

FROM base AS builder

ENV NODE_ENV=production
ENV DOCKER_BUILD=true

COPY --from=deps /app/node_modules ./node_modules

COPY . .

# Generate migrations if they don't exist during Docker build
RUN if [ ! -d "drizzle/migrations" ] || [ -z "$(ls -A drizzle/migrations/*.sql 2>/dev/null)" ]; then \
      echo ""; \
      echo "📝 Migrations not found, generating during Docker build..."; \
      npx drizzle-kit generate || echo "⚠️  Failed to generate migrations - ensure drizzle-kit is installed"; \
      echo ""; \
    else \
      echo "✅ Migrations already exist, skipping generation"; \
    fi

RUN npm run build



# Production runtime image: only standalone server + static assets

FROM node:22-alpine AS runner

WORKDIR /app



ENV NODE_ENV=production

ENV PORT=3000



# Copy standalone server and static files from the build

# (no /public folder in this project, so we skip it)

COPY --from=builder /app/.next/standalone ./

COPY --from=builder /app/.next/static ./.next/static

# Copy migrations folder for auto-migration
COPY --from=builder /app/drizzle ./drizzle

# Expose Next.js default port

EXPOSE 3000



# Start the standalone server

CMD ["node", "server.js"]

