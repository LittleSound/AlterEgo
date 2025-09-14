FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
RUN apt update && apt install -y ca-certificates curl
RUN update-ca-certificates
RUN apt update && apt install -y python3 curl

RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

FROM base AS release
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

ENTRYPOINT [ "bash" ]
CMD [ "bash", "-c", "bun run drizzle:push && bun run start" ]
