FROM node:21-alpine@sha256:87524df5d70923c6733401987fb049f2fb0e10ff460ff19a3bf5f50fd80f63b0

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
