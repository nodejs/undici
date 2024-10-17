FROM node:23-alpine3.19@sha256:144224874a3f67c2b2809f2c7e0f0ea50a9a1235d1b13923ec229b7be6a8d565

ARG UID=1000
ARG GID=1000
ARG BINARYEN_VERSION=116

RUN apk add -U clang lld wasi-sdk
RUN mkdir /home/node/undici

WORKDIR /home/node/undici

RUN wget https://github.com/WebAssembly/binaryen/releases/download/version_$BINARYEN_VERSION/binaryen-version_$BINARYEN_VERSION-x86_64-linux.tar.gz && \
    tar -zxvf binaryen-version_$BINARYEN_VERSION-x86_64-linux.tar.gz binaryen-version_$BINARYEN_VERSION/bin/wasm-opt && \
    mv binaryen-version_$BINARYEN_VERSION/bin/wasm-opt ./ && \
    rm binaryen-version_$BINARYEN_VERSION-x86_64-linux.tar.gz && \
    rm -rf binaryen-version_$BINARYEN_VERSION && \
    chmod +x ./wasm-opt

COPY package.json .

COPY build build
COPY deps deps
COPY lib lib

USER node
