# MockAgent Debugging Improvements Plan

## Current Pain Points

Based on analysis of the MockAgent implementation and test examples, several debugging challenges have been identified:

### 1. Poor Error Messages on Mock Mismatch
- **Problem**: `MockNotMatchedError` provides minimal context about why a request didn't match
- **Current behavior**: Basic error like "Mock dispatch not matched for path '/wrong'"
- **Impact**: Developers struggle to understand what exactly failed to match

### 2. Limited Visibility into Active Interceptors
- **Problem**: No easy way to see what interceptors are currently registered
- **Current behavior**: Only `pendingInterceptors()` shows unused interceptors
- **Impact**: Hard to debug when you have multiple interceptors and don't know which one should match

### 3. Insufficient Request Matching Details
- **Problem**: When a request fails to match, there's no comparison showing expected vs actual
- **Current behavior**: Generic error messages without context
- **Impact**: Time-consuming trial-and-error debugging process

### 4. No Request History by Default
- **Problem**: Call history is disabled by default and requires explicit enabling
- **Current behavior**: Must remember to enable `enableCallHistory: true`
- **Impact**: Lost debugging information when issues occur

### 5. Complex Interceptor Setup Debugging
- **Problem**: Hard to verify interceptor configuration is correct before making requests
- **Current behavior**: Only discover issues when requests fail
- **Impact**: No proactive validation of mock setup

## Proposed Improvements

### 1. Enhanced Error Messages with Context
```javascript
// Current:
"Mock dispatch not matched for path '/api/users'"

// Proposed:
"Mock dispatch not matched for path '/api/users'

Available interceptors for origin 'http://localhost:3000':
┌─────────┬────────┬─────────────┬─────────────┬────────────┐
│ Method  │ Path   │ Status      │ Persistent  │ Remaining  │
├─────────┼────────┼─────────────┼─────────────┼────────────┤
│ GET     │ /api/  │ 200         │ ❌          │ 1          │
│ POST    │ /users │ 201         │ ✅          │ ∞          │
└─────────┴────────┴─────────────┴─────────────┴────────────┘

Request details:
- Method: GET
- Path: /api/users
- Headers: {'content-type': 'application/json'}
- Body: undefined

Potential matches:
- GET /api/* (close match: path differs)
- POST /users (close match: method differs)"
```

### 2. MockAgent.debug() Method
```javascript
const mockAgent = new MockAgent()
const mockPool = mockAgent.get('http://localhost:3000')

// New debugging method
mockAgent.debug() // Returns structured debugging information
// {
//   origins: ['http://localhost:3000'],
//   totalInterceptors: 3,
//   pendingInterceptors: 2,
//   callHistory: { enabled: false, calls: [] },
//   interceptorsByOrigin: {
//     'http://localhost:3000': [
//       { method: 'GET', path: '/api/users', status: 200, timesInvoked: 0, ... }
//     ]
//   }
// }
```

### 3. Interceptor Validation on Setup
```javascript
// Add immediate validation when interceptors are created
mockPool.intercept({ 
  path: '/api/users',
  method: 'GET'
}).reply(200, 'response')
  .validate() // New method to check interceptor configuration
```

### 4. Smart Request Matching with Suggestions
```javascript
// When MockNotMatchedError occurs, provide intelligent suggestions
class EnhancedMockNotMatchedError extends MockNotMatchedError {
  constructor(request, availableInterceptors) {
    const suggestions = findClosestMatches(request, availableInterceptors)
    const message = buildDetailedErrorMessage(request, availableInterceptors, suggestions)
    super(message)
    this.request = request
    this.availableInterceptors = availableInterceptors
    this.suggestions = suggestions
  }
}
```

### 5. Development Mode with Auto-debugging
```javascript
const mockAgent = new MockAgent({ 
  developmentMode: true, // New option
  enableCallHistory: true, // Auto-enabled in dev mode
  verboseErrors: true // Auto-enabled in dev mode
})

// In development mode:
// - All errors include detailed context
// - Call history is automatically enabled
// - Interceptor registration is logged
// - Request matching attempts are traced
```

### 6. Real-time Request Tracing Mode
```javascript
const mockAgent = new MockAgent({ 
  traceRequests: true // New option for console tracing
})

// When enabled, outputs to console.error for every request:
// [MOCK] Incoming request: GET http://localhost:3000/api/users
// [MOCK] ✅ MATCHED interceptor: GET /api/users -> 200
// 
// [MOCK] Incoming request: POST http://localhost:3000/api/posts  
// [MOCK] ❌ NO MATCH found for: POST /api/posts
// [MOCK] Available interceptors:
//   - GET /api/users (method mismatch)
//   - GET /api/posts (method mismatch)
//   - POST /api/user (path mismatch, similarity: 0.8)

// More detailed tracing option
const mockAgent = new MockAgent({ 
  traceRequests: 'verbose' // Detailed request/response tracing
})

// Outputs:
// [MOCK] 🔍 Request received:
//   Method: GET
//   URL: http://localhost:3000/api/users?limit=10
//   Headers: {"accept": "application/json", "user-agent": "undici"}
//   Body: undefined
// 
// [MOCK] 🔎 Checking interceptors for origin 'http://localhost:3000':
//   1. Testing GET /api/users... ✅ MATCH!
//      - Method: ✅ GET === GET
//      - Path: ✅ /api/users === /api/users  
//      - Headers: ✅ (no header constraints)
//      - Body: ✅ (no body constraints)
//   
// [MOCK] ✅ Responding with:
//   Status: 200
//   Headers: {"content-type": "application/json"}
//   Body: {"users": [...]}
```

### 7. Interceptor Diff Tool
```javascript
// New utility method to show differences
mockAgent.compareRequest(request, interceptor)
// Returns:
// {
//   matches: false,
//   differences: [
//     { field: 'path', expected: '/api/users', actual: '/api/user', similarity: 0.9 },
//     { field: 'method', expected: 'POST', actual: 'GET', similarity: 0.0 }
//   ]
// }
```

### 8. Visual Inspector for Test Development
```javascript
// New debugging method that outputs formatted table
mockAgent.inspect()
// Outputs formatted table showing all interceptors, their status, and usage

// Integration with test frameworks
mockAgent.assertNoPendingInterceptors({
  showUnusedInterceptors: true,
  showCallHistory: true,
  includeRequestDiff: true
})
```

## Implementation Priority

1. **High Priority**: Enhanced error messages with context and available interceptors
2. **High Priority**: Real-time request tracing mode with console.error output
3. **High Priority**: MockAgent.debug() method for comprehensive state inspection  
4. **Medium Priority**: Smart request matching with closest-match suggestions
5. **Medium Priority**: Development mode with auto-debugging features
6. **Low Priority**: Interceptor validation on setup
7. **Low Priority**: Interceptor diff tools
8. **Low Priority**: Visual inspector for test development

## Backward Compatibility

All improvements will be opt-in or additive to maintain backward compatibility:
- New constructor options with sensible defaults
- Additional methods that don't interfere with existing API
- Enhanced error messages that extend current error structure
- Development helpers that are optional

## Success Metrics

- Reduced time to debug mock mismatches
- Fewer "why didn't my mock work" support issues
- Improved developer experience in test development
- Better error message clarity and actionability