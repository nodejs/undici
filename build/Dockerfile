FROM node:21-alpine3.19@sha256:ad255c65652e8e99ce0b9d9fc52eee3eae85f445b192f6f9e49a1305c77b2ba6

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
