FROM node:24-trixie AS build-stage

WORKDIR /app

RUN apt update && apt install -y ca-certificates curl
RUN update-ca-certificates
RUN apt update && apt install -y python3 curl

RUN corepack enable

COPY . .
RUN bun install --frozen-lockfile
