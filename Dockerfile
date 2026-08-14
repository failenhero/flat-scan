# syntax=docker/dockerfile:1
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
