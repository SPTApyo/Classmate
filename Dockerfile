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

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node

FROM alpine:${ALPINE_VERSION}

ENV NODE_ENV=production
ENV TZ=Europe/Paris

RUN apk add --no-cache libstdc++ tzdata tini \
  && addgroup -g 1000 node \
  && adduser -u 1000 -G node -s /bin/sh -D node

COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /home/node/IUT_Assistant

COPY --from=build --chown=node:node /src/dist ./

RUN mkdir -p log data/config data/devoirs data/keys data/user_data \
  && chown -R node:node /home/node/IUT_Assistant \
  && chmod -R 700 /home/node/IUT_Assistant

USER node

VOLUME ["/home/node/IUT_Assistant/log", "/home/node/IUT_Assistant/data/config", "/home/node/IUT_Assistant/data/devoirs", "/home/node/IUT_Assistant/data/keys", "/home/node/IUT_Assistant/data/user_data"]

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "index.js"]
