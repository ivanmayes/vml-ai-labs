# =============================================================================
# Site Scraper Lambda — Multi-stage container image
# Base: node:20-slim (NOT Alpine — Chromium requires glibc)
# Target size: ~700MB (node:20-slim 200MB + Chrome 300MB + deps 200MB)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install Chrome browser
# ---------------------------------------------------------------------------
FROM node:20-slim AS chrome-installer

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome for Testing (stable channel)
# Keep the installed files — they get copied to the production stage
RUN npx --yes @puppeteer/browsers install chrome@stable --install-deps

# ---------------------------------------------------------------------------
# Stage 2: Build TypeScript
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# ---------------------------------------------------------------------------
# Stage 3: Build aws-lambda-ric (needs native C++ toolchain)
# ---------------------------------------------------------------------------
FROM node:20-slim AS ric-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake make g++ python3 autoconf automake libtool libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g aws-lambda-ric

# ---------------------------------------------------------------------------
# Stage 4: Production image
# ---------------------------------------------------------------------------
FROM node:20-slim AS production

# System dependencies for Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    libx11-xcb1 \
    libxext6 \
    libxfixes3 \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    libcurl4 \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built Lambda RIC from ric-builder stage
COPY --from=ric-builder /usr/local/lib/node_modules/aws-lambda-ric /usr/local/lib/node_modules/aws-lambda-ric
RUN ln -s /usr/local/lib/node_modules/aws-lambda-ric/bin/index.mjs /usr/local/bin/aws-lambda-ric

WORKDIR /app

# Copy production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Rebuild sharp for this platform (needs native binaries)
RUN npm rebuild sharp

# Copy compiled JS from builder
COPY --from=builder /build/dist/ ./dist/

# Copy Chrome from installer stage
COPY --from=chrome-installer /chrome/ /chrome/

# Find Chrome executable path and store it
RUN CHROME_PATH=$(find /chrome -name "chrome" -type f -executable | head -1) \
    && echo "${CHROME_PATH}" > /app/.chrome-path \
    && echo "Chrome found at: ${CHROME_PATH}"

ENV CHROME_EXECUTABLE_PATH=""

# Lambda handler entrypoint
ENTRYPOINT ["aws-lambda-ric"]
CMD ["dist/handler.handler"]
