FROM node:21-alpine@sha256:7bfef1d72befbb72b0894a3e4503edbdc0441058b4d091325143338cbf54cff8

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
