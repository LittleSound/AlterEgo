FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
RUN apt update && apt install -y ca-certificates curl
RUN update-ca-certificates
RUN apt update && apt install -y python3 curl

COPY package.json .
COPY bun.lock .
RUN bun install --frozen-lockfile

COPY . .
RUN ls -la node_modules

ENTRYPOINT [ "bash", "-c", "bun run drizzle:push && bun run start" ]
