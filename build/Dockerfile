FROM node:20-alpine@sha256:4559bc033338938e54d0a3c2f0d7c3ad7d1d13c28c4c405b85c6b3a26f4ce5f7

ARG UID=1000
ARG GID=1000

RUN apk add -U clang lld wasi-sdk
RUN mkdir /home/node/undici

WORKDIR /home/node/undici

COPY package.json .
COPY build build
COPY deps deps
COPY lib lib

RUN npm i

USER node
