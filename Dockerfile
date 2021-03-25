FROM node:14.16.0-buster

ARG UID=1000
ARG GID=1000
ARG WASI_SDK_VERSION_MAJOR=12
ARG WASI_SDK_VERSION_MINOR=0

ENV WASI_ROOT=/home/node/wasi-sdk-12.0

RUN wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION_MAJOR}/wasi-sdk-${WASI_SDK_VERSION_MAJOR}.${WASI_SDK_VERSION_MINOR}-linux.tar.gz -P /tmp

RUN tar xvf /tmp/wasi-sdk-${WASI_SDK_VERSION_MAJOR}.${WASI_SDK_VERSION_MINOR}-linux.tar.gz --directory /home/node

RUN mkdir /home/node/undici

WORKDIR /home/node/undici

COPY . .

RUN npm ci

USER node
