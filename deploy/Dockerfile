FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --include=dev

COPY . .

ENV NITRO_PRESET=node-server
ENV PATH="/app/node_modules/.bin:${PATH}"

# Verify that Vite is installed before building.
RUN test -x /app/node_modules/.bin/vite || (echo "ERROR: Vite is missing from node_modules/.bin" && exit 1)

# Build the application.
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