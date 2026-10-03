FROM ghcr.io/nodejs/wasm-builder:v0.0.10

USER root

ARG BINARYEN_VERSION=123
ARG RUST_TOOLCHAIN=nightly-2026-07-29

RUN set -eux; \
    case "$(uname -m)" in \
      x86_64) binaryen_arch=x86_64 ;; \
      aarch64) binaryen_arch=aarch64 ;; \
      *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;; \
    esac; \
    wget -q "https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/binaryen-version_${BINARYEN_VERSION}-${binaryen_arch}-linux.tar.gz" -O /tmp/binaryen.tar.gz; \
    tar -xzf /tmp/binaryen.tar.gz -C /tmp; \
    install -m 0755 "/tmp/binaryen-version_${BINARYEN_VERSION}/bin/wasm-opt" /usr/local/bin/wasm-opt; \
    rm -rf /tmp/binaryen.tar.gz "/tmp/binaryen-version_${BINARYEN_VERSION}"

USER node

RUN set -eux; \
    rustup toolchain install "${RUST_TOOLCHAIN}" --profile minimal; \
    rustup target add wasm32-unknown-unknown --toolchain "${RUST_TOOLCHAIN}"; \
    rustup component add rust-src --toolchain "${RUST_TOOLCHAIN}"; \
    cargo +"${RUST_TOOLCHAIN}" install cargo-make --locked

ENV PATH="/home/node/.cargo/bin:${PATH}"
ENV RUSTUP_TOOLCHAIN=nightly-2026-07-29

WORKDIR /workspace/parser

# Build from an internal copy so Cargo and the build tasks cannot modify the
# read-only source mount. Only the generated WASM artifacts are written out.
CMD ["sh", "-ec", "cp -a /src /tmp/milo && cd /tmp/milo/parser && makers wasm && mkdir -p /output && cp -a /tmp/milo/dist/wasm/. /output/"]
