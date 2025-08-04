# SOCKS5 Support Implementation Plan for Undici ProxyAgent

## Executive Summary

This document outlines a comprehensive plan to implement SOCKS5 proxy support in Undici's ProxyAgent. The implementation will extend the existing HTTP proxy functionality to support the SOCKS5 protocol as defined in RFC 1928, enabling Undici to work with SOCKS5 proxy servers for both TCP connections and UDP associations.

## Current State Analysis

### Existing ProxyAgent Architecture
- **Location**: `lib/dispatcher/proxy-agent.js`
- **Current Support**: HTTP/HTTPS proxies with CONNECT tunneling
- **Key Components**:
  - `ProxyAgent` class extending `DispatcherBase`
  - `Http1ProxyWrapper` for non-tunneled HTTP proxy requests
  - Authentication support (Basic auth, Bearer tokens)
  - TLS support for both proxy and target connections
  - Connection pooling via Agent/Pool/Client dispatchers

### Current Flow
1. ProxyAgent creates a connection to the HTTP proxy
2. For HTTPS targets: Sends CONNECT request to establish tunnel
3. For HTTP targets: Either tunnels (proxyTunnel: true) or forwards requests directly
4. Handles authentication via HTTP headers
5. Manages TLS termination for both proxy and target connections

## SOCKS5 Protocol Overview (RFC 1928)

### Protocol Flow
1. **Initial Handshake**: Client sends authentication methods, server selects one
2. **Authentication**: Method-specific sub-negotiation (if required)
3. **Connection Request**: Client sends CONNECT/BIND/UDP ASSOCIATE command
4. **Server Response**: Success/failure with bound address information
5. **Data Transfer**: Direct socket forwarding or UDP relay

### Key Features to Implement
- **Authentication Methods**:
  - No authentication (0x00)
  - Username/Password (0x02) - RFC 1929
  - GSSAPI (0x01) - Optional
- **Commands**:
  - CONNECT (0x01) - TCP connection
  - BIND (0x02) - TCP listening socket
  - UDP ASSOCIATE (0x03) - UDP relay
- **Address Types**:
  - IPv4 (0x01)
  - Domain name (0x03)
  - IPv6 (0x04)

## Implementation Plan

### Phase 1: Core SOCKS5 Protocol Implementation

#### 1.1 Create SOCKS5 Client Module
**File**: `lib/core/socks5-client.js`

**Responsibilities**:
- Handle SOCKS5 protocol handshake
- Implement authentication methods
- Parse and generate SOCKS5 protocol messages
- Manage connection state machine

**Key Functions**:
```javascript
class Socks5Client {
  constructor(socket, options)
  async authenticate(methods)
  async connect(address, port, addressType)
  async bind(address, port, addressType)
  async udpAssociate(address, port, addressType)
}
```

#### 1.2 Protocol Message Parsing
**Utilities for**:
- Initial handshake (method selection)
- Authentication sub-negotiation
- Connection requests and responses
- Address encoding/decoding (IPv4, IPv6, domain names)
- Error code mapping

#### 1.3 Authentication Implementation
**Username/Password (RFC 1929)**:
- Sub-negotiation after method selection
- Send username/password credentials
- Handle authentication success/failure

### Phase 1.5: Docker Compose Testing Environment

#### 1.5.1 Create Docker Compose Configuration
**File**: `docker-compose.yml`

**Components**:
- SOCKS5 proxy server (Dante or similar)
- HTTP/HTTPS test servers
- Network isolation for testing
- Multiple authentication scenarios

**Features**:
- No-auth SOCKS5 proxy
- Username/password auth proxy
- Test target servers (HTTP/HTTPS)
- Network failure simulation
- Performance testing environment

#### 1.5.2 Test Scenarios
- Basic connectivity tests
- Authentication tests (success/failure)
- Connection refused scenarios
- Network unreachable tests
- High concurrency tests
- TLS through SOCKS5 tests

### Phase 2: ProxyAgent Integration

#### 2.1 Extend ProxyAgent Constructor
**Add SOCKS5 Options**:
```javascript
{
  uri: 'socks5://user:pass@proxy.example.com:1080',
  socksVersion: 5, // Default, could support SOCKS4/4a later
  socksAuth: {
    username: 'user',
    password: 'pass'
  },
  socksCommand: 'connect' // 'connect', 'bind', 'udp_associate'
}
```

#### 2.2 Protocol Detection
**URL Scheme Handling**:
- `socks5://` - SOCKS5 proxy
- `socks://` - Generic SOCKS (default to SOCKS5)
- Maintain backward compatibility with `http://` and `https://`

#### 2.3 Create Socks5ProxyWrapper
**File**: `lib/dispatcher/socks5-proxy-wrapper.js`

Similar to `Http1ProxyWrapper`, but implementing SOCKS5 protocol:
```javascript
class Socks5ProxyWrapper extends DispatcherBase {
  constructor(proxyUrl, options)
  [kDispatch](opts, handler)
  async establishConnection(targetHost, targetPort)
}
```

### Phase 3: Connection Management

#### 3.1 SOCKS5 Connection Factory
**Integration Point**: Modify ProxyAgent's connect function
```javascript
connect: async (opts, callback) => {
  if (this[kProxy].protocol === 'socks5:') {
    return this.connectViaSocks5(opts, callback);
  }
  // Existing HTTP proxy logic
}
```

#### 3.2 Socket Management and Connection Pooling

**CRITICAL ARCHITECTURAL REQUIREMENT**: SOCKS5 implementation must use Pool instead of Client for connection management to ensure proper connection pooling and lifecycle management.

**Connection Pooling Architecture**:
- Use `Pool` dispatcher for managing multiple connections to the same origin through SOCKS5 proxy
- Each Pool instance should manage connections to a specific target origin via the SOCKS5 proxy
- Implement proper connection reuse for the same target host/port combinations
- Handle connection lifecycle (establish, use, close) at the Pool level

**Key Changes Required**:
- Modify `Socks5ProxyWrapper` to use Pool instead of Client for target connections
- Implement custom connect function that establishes SOCKS5 tunnel and returns socket to Pool
- Ensure proper cleanup and error handling for pooled SOCKS5 connections
- Support connection limits and timeout configurations per Pool instance

**Implementation Details**:
- Handle raw TCP socket communication for SOCKS5 protocol
- Manage SOCKS5 tunnel establishment before handing socket to Pool
- Error handling and connection recovery at both SOCKS5 and Pool levels
- Support for HTTP/1.1 pipelining over SOCKS5 tunnels

#### 3.3 Address Resolution
- Support for IPv4, IPv6, and domain name addresses
- Proper encoding of address types per RFC 1928
- Handle address type negotiation

### Phase 4: Advanced Features

#### 4.1 UDP Support (SOCKS5 UDP ASSOCIATE)
**For applications requiring UDP**:
- Implement UDP relay functionality
- Handle UDP packet encapsulation
- Manage UDP association lifecycle

#### 4.2 BIND Command Support
**For server applications**:
- Implement SOCKS5 BIND command
- Handle incoming connection acceptance
- Integrate with Undici's server-side capabilities

#### 4.3 Authentication Extensions
- GSSAPI support (RFC 1961)
- Custom authentication methods
- Certificate-based authentication

### Phase 5: Testing and Documentation

#### 5.1 Unit Tests
**File**: `test/socks5-client.js`
- Protocol message parsing/generation
- Authentication flow testing
- Error condition handling
- Address type encoding/decoding

#### 5.2 Integration Tests
**File**: `test/socks5-proxy-agent.js`
- End-to-end SOCKS5 proxy connection
- Authentication scenarios
- Multiple concurrent connections
- Error scenarios (proxy failure, authentication failure)
- Performance benchmarks

#### 5.3 Documentation Updates
- API documentation for SOCKS5 options
- Usage examples and best practices
- Migration guide from HTTP proxies
- Performance considerations

## Critical Implementation Issue

### Current Architecture Problem

**Issue**: The current SOCKS5 implementation in `Socks5ProxyWrapper` uses `Client` instead of `Pool` for managing connections to target servers. This violates Undici's architectural principles and limits performance.

**Problems with Current Approach**:
1. **No Connection Pooling**: Client only supports single connections, preventing connection reuse
2. **Performance Impact**: Each request creates a new SOCKS5 tunnel, increasing latency
3. **Resource Inefficiency**: No connection sharing for multiple requests to same origin
4. **Architectural Inconsistency**: Differs from HTTP proxy implementation pattern

### Required Changes

**Immediate Action Required**:
1. **Update Socks5ProxyWrapper**: Replace Client with Pool in the dispatch method
2. **Implement Pool-based Connection Management**:
   - Create Pool instances for each target origin
   - Implement custom connect function that establishes SOCKS5 tunnel
   - Return established socket to Pool for HTTP communication
3. **Test Connection Reuse**: Verify multiple requests reuse SOCKS5 connections
4. **Performance Validation**: Ensure connection pooling provides expected performance benefits

**Code Changes Needed**:
```javascript
// Current (incorrect) approach:
const client = new Client(origin, { connect: () => socket })

// Required (correct) approach:
const pool = new Pool(origin, {
  connect: async (opts, callback) => {
    const socket = await this.establishSocks5Connection(opts)
    callback(null, socket)
  }
})
```

## Implementation Details

### Protocol State Machine

```
[Initial] -> [Handshake] -> [Auth] -> [Connected] -> [Data Transfer]
    |            |           |          |
    v            v           v          v
[Error]      [Error]    [Error]    [Closed]
```

### Authentication Flow (Username/Password)

```
1. Client -> Server: [VER=5][NMETHODS=1][METHOD=0x02]
2. Server -> Client: [VER=5][METHOD=0x02]
3. Client -> Server: [VER=1][ULEN][USERNAME][PLEN][PASSWORD]
4. Server -> Client: [VER=1][STATUS]
```

### Connection Request Flow

```
1. Client -> Server: [VER=5][CMD=1][RSV=0][ATYP][DST.ADDR][DST.PORT]
2. Server -> Client: [VER=5][REP][RSV=0][ATYP][BND.ADDR][BND.PORT]
```

### Error Handling Strategy

- **Connection Errors**: Map SOCKS5 error codes to Undici error types
- **Authentication Failures**: Throw InvalidArgumentError with specific message
- **Protocol Violations**: Log and gracefully degrade or fail
- **Network Issues**: Implement retry logic with exponential backoff

### Performance Considerations

- **Connection Pooling**: Reuse SOCKS5 connections when possible
- **Pipeline Support**: Handle multiple requests over single SOCKS5 connection
- **Memory Management**: Efficient buffer management for protocol messages
- **Async/Await**: Non-blocking implementation throughout

## File Structure

```
lib/
├── core/
│   ├── socks5-client.js          # Core SOCKS5 protocol implementation
│   ├── socks5-auth.js            # Authentication methods
│   └── socks5-utils.js           # Protocol utilities and constants
├── dispatcher/
│   ├── proxy-agent.js            # Extended to support SOCKS5
│   └── socks5-proxy-wrapper.js   # SOCKS5 proxy wrapper
└── types/
    └── socks5-proxy-agent.d.ts   # TypeScript definitions

test/
├── socks5-client.js              # Core protocol tests
├── socks5-proxy-agent.js         # Integration tests
└── fixtures/
    └── socks5-server.js          # Test SOCKS5 server

docs/
└── api/
    └── Socks5ProxyAgent.md       # API documentation
```

## Migration Path

### Backward Compatibility
- Existing HTTP proxy configurations remain unchanged
- New SOCKS5 options are additive, not breaking changes
- Default behavior for HTTP/HTTPS proxies unchanged

### Configuration Migration
```javascript
// Old HTTP proxy configuration
const agent = new ProxyAgent('http://proxy.example.com:8080');

// New SOCKS5 proxy configuration
const agent = new ProxyAgent('socks5://proxy.example.com:1080');

// Mixed environments
const httpAgent = new ProxyAgent('http://proxy.example.com:8080');
const socksAgent = new ProxyAgent('socks5://proxy.example.com:1080');
```

## Security Considerations

### Authentication Security
- Secure credential handling (avoid plaintext storage)
- Support for encrypted authentication methods
- Certificate validation for SOCKS5 over TLS

### Network Security
- Proper handling of DNS resolution (local vs remote)
- IPv6 support and security implications
- Rate limiting and connection limits

### Data Integrity
- Proper error handling for malformed packets
- Buffer overflow protection
- Input validation for all protocol fields

## Success Criteria

### Functional Requirements
- [ ] Support SOCKS5 CONNECT command for TCP connections
- [ ] Username/password authentication working
- [ ] IPv4, IPv6, and domain name address support
- [ ] Integration with existing Undici dispatcher pattern
- [ ] Comprehensive error handling and reporting

### Performance Requirements
- [ ] Connection establishment latency < 2x HTTP proxy
- [ ] Memory usage comparable to HTTP proxy implementation
- [ ] Support for connection pooling and reuse
- [ ] Graceful degradation under high load

### Quality Requirements
- [ ] 100% test coverage for new SOCKS5 code
- [ ] Zero breaking changes to existing API
- [ ] Complete TypeScript definitions
- [ ] Documentation and examples

## Timeline Estimation

- **Phase 1** (Core Protocol): 2-3 weeks
- **Phase 2** (ProxyAgent Integration): 1-2 weeks
- **Phase 3** (Connection Management): 2-3 weeks
- **Phase 4** (Advanced Features): 3-4 weeks
- **Phase 5** (Testing & Documentation): 1-2 weeks

**Total Estimated Duration**: 9-14 weeks

## Dependencies

- Node.js Buffer API for binary protocol handling
- Existing Undici dispatcher and connection management
- Test infrastructure (existing test harness)
- Optional: SOCKS5 test server for integration testing

This plan provides a comprehensive roadmap for implementing SOCKS5 support in Undici while maintaining compatibility with existing functionality and following established patterns in the codebase.
