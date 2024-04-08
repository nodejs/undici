FROM node:21-alpine@sha256:ad255c65652e8e99ce0b9d9fc52eee3eae85f445b192f6f9e49a1305c77b2ba6

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
