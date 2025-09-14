FROM oven/bun:debian

WORKDIR /app

RUN apt update && apt install -y ca-certificates curl
RUN update-ca-certificates
RUN apt update && apt install -y python3 curl

RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

COPY --from=install /temp/dev/node_modules node_modules
COPY . .
