# TellNet for a VPS: Node server build (not the Vercel build).
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# Vite and other devDependencies are required to build the application.
RUN npm ci --include=dev

COPY . .

ENV NITRO_PRESET=node-server

# Build the application without requiring production DATABASE_URL.
RUN node --env-file-if-exists=.env scripts/with-app-env.mjs vite build


FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/package.json ./package.json

CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]