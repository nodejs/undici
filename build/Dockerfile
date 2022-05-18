FROM node:16.13.0-buster

ARG UID=1000
ARG GID=1000
ARG WASI_SDK_VERSION_MAJOR=14
ARG WASI_SDK_VERSION_MINOR=0

ENV WASI_ROOT=/home/node/wasi-sdk-${WASI_SDK_VERSION_MAJOR}.${WASI_SDK_VERSION_MINOR}

RUN wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION_MAJOR}/wasi-sdk-${WASI_SDK_VERSION_MAJOR}.${WASI_SDK_VERSION_MINOR}-linux.tar.gz -P /tmp

RUN tar xvf /tmp/wasi-sdk-${WASI_SDK_VERSION_MAJOR}.${WASI_SDK_VERSION_MINOR}-linux.tar.gz --directory /home/node

RUN mkdir /home/node/undici

WORKDIR /home/node/undici

COPY package.json .
COPY build build
COPY deps deps
COPY lib lib

RUN npm i

USER node
