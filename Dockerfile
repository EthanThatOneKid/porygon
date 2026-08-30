# -- build stage --
FROM node:22-slim AS build

# node-pty (transitive dep of @letta-ai/letta-agent-sdk) needs build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first (layer cache)
COPY package.json ./
COPY package-lock.json* ./

# Install ALL deps (including devDependencies for TypeScript)
RUN npm install

# Copy source and build TypeScript
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# -- runtime stage --
FROM node:22-slim

# node-pty needs build tools for runtime too
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Letta CLI globally (provides `letta` command for runtime)
RUN npm install -g @letta-ai/letta-code

# Copy built artifacts and PRODUCTION deps from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Copy shell scripts (discord-setup, discord-start, etc.)
COPY scripts ./scripts
RUN chmod +x scripts/*.sh

EXPOSE 3000

# Render sets PORT env var; default to 3000
ENV PORT=3000

CMD ["node", "dist/index.js"]
