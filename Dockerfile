# -- build stage --
FROM node:22-slim AS build

WORKDIR /app

# Install Letta CLI globally (needed for `letta server` at runtime)
RUN npm install -g @letta-ai/letta-code

# Copy dependency manifests first (layer cache)
COPY package.json ./
COPY package-lock.json* ./
RUN npm install --omit=dev

# Copy source and build TypeScript
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# -- runtime stage --
FROM node:22-slim

WORKDIR /app

# Install Letta CLI globally in runtime image too
RUN npm install -g @letta-ai/letta-code

# Copy built artifacts and production deps from build stage
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
