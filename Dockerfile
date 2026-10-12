# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.22

# Output is platform independent: build without emulation.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN HUSKY=0 npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Debug symbols are about 15 MB of the binary.
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node
RUN apk add --no-cache binutils && strip /usr/local/bin/node

FROM alpine:${ALPINE_VERSION}

ENV NODE_ENV=production
ENV TZ=UTC

RUN apk add --no-cache libstdc++ tzdata tini \
  && addgroup -g 1000 node \
  && adduser -u 1000 -G node -s /bin/sh -D node

COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /app

# Ownership set before the copy: no duplicated layer.
RUN mkdir -p log data/config data/assignments data/keys data/user_data \
  && chown -R node:node /app \
  && chmod -R 700 /app

COPY --from=build --chown=node:node /src/dist ./

USER node

VOLUME ["/app/data", "/app/log"]

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "index.js"]
