FROM node:21-alpine@sha256:8bf9240217fe9cf26456fa685bca1e1b92f8fe6995c8cf73c9876b9d6960bd35

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
