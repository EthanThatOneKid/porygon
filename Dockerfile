# -- build stage --
FROM node:22-slim AS build

# Install build tools for native modules (node-pty from letta-code)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./

RUN npm install

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# -- runtime stage --
FROM node:22-slim

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
