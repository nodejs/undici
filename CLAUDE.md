# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Commands

**Testing:**
- `npm run test` - Full test suite (JavaScript + TypeScript)
- `npm run test:unit` - Core unit tests
- `npm run test:fetch` - Fetch API tests
- `npm run test:websocket` - WebSocket tests
- `npm run test:h2` - HTTP/2 tests
- `npm run test:cache` - Cache-related tests
- `npm run test:interceptors` - Interceptor tests
- `npm run test:wpt` - Web Platform Tests
- `npm run test:node-test` - Node.js specific tests

**Single test runs:**
- `borp -p "test/specific-test.js"` - Run a specific test file
- `borp -p "test/category/*.js"` - Run tests in a category

**Linting & Quality:**
- `npm run lint` - ESLint check
- `npm run lint:fix` - Auto-fix linting issues
- `npm run coverage` - Generate test coverage report

**Build:**
- `npm run build:node` - Build bundled fetch for Node.js
- `npm run build:wasm` - Build WebAssembly components (requires Docker)

## Architecture Overview

Undici is an HTTP/1.1 client with Fetch API implementation for Node.js, structured around several core concepts:

### Dispatcher Pattern
The foundation is the `Dispatcher` abstract class that defines the interface for making HTTP requests. All HTTP clients implement this pattern:

- **Agent** - Multi-host connection pooler (default global dispatcher)
- **Client** - Single-host HTTP/1.1 client with connection pooling  
- **Pool** - Connection pool for a single origin
- **BalancedPool** - Load balancer across multiple pools
- **ProxyAgent/EnvHttpProxyAgent** - Proxy-aware dispatchers
- **RetryAgent** - Automatic retry logic wrapper

### Core Components

**lib/core/** - Fundamental utilities:
- `connect.js` - Low-level connection establishment
- `request.js` - Request object implementation  
- `util.js` - Parsing and validation utilities
- `errors.js` - Error definitions

**lib/api/** - High-level API implementations:
- `api-request.js` - Basic request/response
- `api-stream.js` - Streaming interface
- `api-pipeline.js` - Pipeline interface

**lib/web/** - Web standards implementations:
- `fetch/` - Complete Fetch API implementation
- `websocket/` - WebSocket client
- `eventsource/` - EventSource implementation
- `cache/` - Cache API
- `cookies/` - Cookie handling

### HTTP Parser
Uses a WebAssembly build of llhttp parser located in `lib/llhttp/`. The sources are in `deps/llhttp/` and can be rebuilt with `npm run build:wasm`.

### Interceptor System
Interceptors wrap dispatchers to add functionality:
- `redirect` - Automatic redirect handling
- `retry` - Retry failed requests
- `cache` - HTTP caching
- `dns` - DNS resolution caching
- `dump` - Request/response logging

### Testing Structure
- `test/` - Main test directory
- `test/wpt/` - Web Platform Tests
- `test/fetch/` - Fetch API tests
- `test/websocket/` - WebSocket tests
- `test/node-test/` - Node.js integration tests
- Test runner: `borp` (not Jest for most tests)

## Development Notes

**Standards Compliance:**
- Implements Fetch Standard with Node.js adaptations
- WebSocket per RFC 6455
- HTTP/1.1 per RFC 9110
- Supports HTTP/2 via h2c-client

**Key Files to Know:**
- `index.js` - Main entry point, exports all APIs
- `lib/global.js` - Global dispatcher management
- `lib/dispatcher/agent.js` - Default multi-host client
- `lib/web/fetch/index.js` - Fetch implementation entry
- `package.json` - Contains all npm script definitions

**Code Style:**
- Uses neostandard (ESLint config)
- No trailing commas in objects/arrays
- TypeScript definitions in `types/` directory

**Git Commits:**
- Always use `git commit -s` to add signoff when committing changes

**WebAssembly Components:**
- HTTP parser is WebAssembly-based
- Requires Docker to rebuild
- Pre-built binaries included in `lib/llhttp/`