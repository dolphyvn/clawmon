# ClawMon Docker Image
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build

# Production image
FROM node:22-alpine

# Create non-root user
RUN addgroup -g 1000 -S node && \
    adduser -S -u 1000 node

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create config directory
RUN mkdir -p /home/node/.clawmon && \
    chown -R node:node /home/node/.clawmon

USER node

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('ws').createConnection('ws://localhost:18790').on('error', () => process.exit(1)).on('open', () => process.exit(0))" || exit 1

CMD ["node", "dist/cli.js"]
