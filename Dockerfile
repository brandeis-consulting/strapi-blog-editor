# --- Build stage ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps with full dev dependencies for the build
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# Copy sources and build renderer + server bundles
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
RUN npm run build

# --- Runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Bring in the compiled renderer + server
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# Run as a non-root user
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "dist-server/index.js"]
