FROM node:21-alpine@sha256:9696b265f0a9ad213c690f2aa777d3e001ff91847f7370e15d66fbfe23ce51b2

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
