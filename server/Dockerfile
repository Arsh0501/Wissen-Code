FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl chromium fonts-liberation fonts-noto-core ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/config ./src/config
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
FROM build AS runtime
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
USER node
EXPOSE 4001
CMD ["node", "dist/index.js"]
