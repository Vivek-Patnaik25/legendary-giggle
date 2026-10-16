# Stage 1: Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build client
COPY . .
RUN npm run build:client

# Stage 2: Production runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Copy node_modules and built assets
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

EXPOSE 3001

CMD ["npx", "tsx", "src/server/index.ts"]
