FROM node:21-alpine@sha256:d3271e4bd89eec4d97087060fd4db0c238d9d22fcfad090a73fa9b5128699888

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
