# Plan to Resolve PR 4270 Comments

This plan addresses all feedback from PR #4270 "feat: add SnapshotAgent for HTTP request recording and playback".

## Current Status: Phase 3 Complete ✅

**Phase 1 (Code Review Fixes)** - ✅ Complete
**Phase 2 (Enhanced Request Matching)** - ✅ Complete
**Phase 3 (Advanced Playback Features)** - ✅ Complete

All tests are passing (30 total tests). Recent accomplishments:

### Phase 1 ✅
- ✅ Constructor options validation with proper error messages
- ✅ Memory management with maxSnapshots and LRU eviction  
- ✅ Auto-flush functionality with configurable intervals
- ✅ Enhanced documentation with JSDoc
- ✅ Comprehensive test coverage
- ✅ Bug fixes for header handling and error propagation

### Phase 2 ✅  
- ✅ Customizable request matching (matchHeaders, ignoreHeaders)
- ✅ Security-focused header filtering (excludeHeaders)
- ✅ Query parameter matching control (matchQuery)
- ✅ Request body matching control (matchBody)
- ✅ Case sensitivity options for header matching
- ✅ Comprehensive test coverage for all matching scenarios

### Phase 3 ✅
- ✅ Sequential response support ("first call returns X, second call returns Y")
- ✅ Modified storage format to support response arrays
- ✅ Updated findSnapshot to return appropriate response based on call count
- ✅ Added resetCallCounts method for test cleanup
- ✅ Added snapshot management methods (deleteSnapshot, getSnapshotInfo, replaceSnapshots)
- ✅ Comprehensive test coverage for sequential responses and management

## Summary of Feedback

### High-Level Feature Requests (GeoffreyBooth)
1. **Custom request matching** - Allow matching on some headers but not all, ignore auth tokens
2. **Multiple response sequences** - Support "first call returns X, second call returns Y" like nock
3. **Update existing snapshots** - Way to fully replace existing snapshot sets, not just additive

### Code Review Issues (metcoder95)
1. **Options validation** - Add mode validation to constructor (lib/mock/snapshot-agent.js:70)
2. **Unused _setupMockInterceptors method** - Clarify purpose (lib/mock/snapshot-agent.js:190)
3. **Memory management** - Allow customizable max number of snapshots to prevent memory issues (lib/mock/snapshot-recorder.js:85)
4. **Auto-flush feature** - Automatic saving to disk when configured (lib/mock/snapshot-recorder.js:85)

### Integration Suggestions (metcoder95)
1. **Mock integration** - Explore compatibility with existing Mocks feature
2. **Request filtering** - Allow excluding certain requests from snapshots (security)

## Current Implementation Analysis

Based on the code review, the implementation is more complete than initially apparent:

### What's Already Implemented
- ✅ Basic record/playback/update modes
- ✅ File persistence with proper JSON format
- ✅ Request matching via hash-based system
- ✅ MockAgent integration (line 190 has working `_setupMockInterceptors`)
- ✅ Memory management via Map data structure
- ✅ Header normalization (lowercase, array handling)
- ✅ POST request body handling
- ✅ Base64 body encoding for consistency
- ✅ Comprehensive test coverage

### What Needs Enhancement
- 🔧 Constructor options validation
- 🔧 Customizable request matching
- 🔧 Sequential response support
- 🔧 Memory limits and auto-flush
- 🔧 Request filtering for security

## Implementation Plan

### Phase 1: Code Review Fixes

#### 1.1 Constructor Options Validation
**File:** `lib/mock/snapshot-agent.js:23-24`
- Add validation for `mode` parameter (must be 'record', 'playback', or 'update')
- Validate `snapshotPath` is provided when required
- Add proper error handling with descriptive messages

#### 1.2 Document _setupMockInterceptors Purpose  
**File:** `lib/mock/snapshot-agent.js:190`
- The method is actually implemented and functional
- Add JSDoc comments explaining its purpose
- Consider making it public or adding tests

#### 1.3 Memory Management Options
**File:** `lib/mock/snapshot-recorder.js:61-66`
- Add `maxSnapshots` option to constructor
- Add `autoFlush` and `flushInterval` options
- Implement LRU eviction when maxSnapshots is reached
- Add automatic periodic saves when autoFlush is enabled

### Phase 2: Enhanced Request Matching

#### 2.1 Customizable Matching Rules
**File:** `lib/mock/snapshot-recorder.js:49-58`
- Add `matchOptions` to SnapshotRecorder constructor:
  ```javascript
  {
    matchHeaders: ['content-type', 'accept'], // Only these headers
    ignoreHeaders: ['authorization', 'x-api-key'], // Skip these
    matchBody: true, // Include body in hash (default: true)
    matchQuery: true, // Include query in hash (default: true)
    caseSensitive: false // Header case sensitivity (default: false)
  }
  ```
- Modify `createRequestHash()` to use custom matching rules
- Update `formatRequestKey()` to filter headers per configuration

#### 2.2 Security-Focused Header Filtering
**File:** `lib/mock/snapshot-recorder.js:20-45`
- Add `excludeHeaders` option to prevent recording sensitive data
- Add `sanitizeHeaders` function for cleaning tokens before storage
- Add `shouldRecord` callback for request-level filtering

### Phase 3: Advanced Playback Features

#### 3.1 Sequential Response Support
**File:** `lib/mock/snapshot-recorder.js:85-90`
- Modify storage format to support response arrays:
  ```javascript
  this.snapshots.set(hash, {
    request,
    responses: [responseData], // Array instead of single response
    callCount: 0,
    timestamp: new Date().toISOString()
  })
  ```
- Update `findSnapshot()` to return appropriate response based on call count
- Add `resetCallCounts()` method for test cleanup

#### 3.2 Snapshot Management Enhancement
**File:** `lib/mock/snapshot-agent.js`
- Add `replaceSnapshots()` method for full replacement vs merge
- Add `deleteSnapshot()` for individual removal
- Add `getSnapshotInfo()` for inspection/debugging

### Phase 4: Mock Integration & Request Filtering

#### 4.1 Enhanced MockAgent Compatibility
**File:** `lib/mock/snapshot-agent.js:190-207`
- Add priority system: manual mocks override snapshots
- Add fallback behavior: use snapshots when no manual mock exists
- Test integration with existing MockAgent features

#### 4.2 Request Filtering API
**File:** `lib/mock/snapshot-agent.js:44-72`
- Add `shouldRecord(opts)` callback option
- Add `shouldPlayback(opts)` callback option  
- Add URL pattern exclusion (regex or glob patterns)

## Todo List

### High Priority (Phase 1 - COMPLETED ✅)
- [x] Add constructor options validation with proper error messages
- [x] Implement maxSnapshots and LRU eviction in SnapshotRecorder
- [x] Add auto-flush functionality with configurable intervals
- [x] Document _setupMockInterceptors method with JSDoc
- [x] Add comprehensive options validation tests

### Medium Priority (Phase 2 - COMPLETED ✅)
- [x] Implement customizable request matching (matchHeaders, ignoreHeaders)
- [x] Add security-focused header filtering (excludeHeaders, sanitizeHeaders)

### High Priority (Phase 3 - COMPLETED ✅)
- [x] Implement sequential response support for multiple calls
- [x] Add snapshot management methods (replace, delete, inspect)
- [ ] Add request filtering callbacks (shouldRecord, shouldPlayback)

### Low Priority
- [ ] Add URL pattern-based request exclusion
- [ ] Enhance MockAgent integration with priority system
- [ ] Add performance optimizations for large snapshot sets
- [ ] Add debugging utilities and verbose logging options
- [ ] Improve error messages with request context

### Testing & Documentation
- [x] Add tests for new options validation (Phase 1)
- [x] Add tests for memory management features (Phase 1)
- [x] Add tests for custom matching scenarios (Phase 2)
- [x] Add tests for sequential response playback (Phase 3)
- [x] Add tests for snapshot management methods (Phase 3)
- [ ] Add tests for request filtering
- [ ] Update TypeScript definitions for new options
- [ ] Add documentation for advanced usage patterns
- [ ] Create migration examples for users coming from nock

### Future Enhancements
- [ ] Consider async snapshot loading for very large files
- [ ] Add snapshot format versioning for future compatibility
- [ ] Add compression for large snapshot files
- [ ] Add snapshot diff/merge utilities for team workflows
- [ ] Add integration with popular testing frameworks

## Breaking Changes

None of the proposed changes will break the existing API. All new features will be opt-in through configuration options, maintaining backward compatibility.

## Notes

- The current implementation is solid and well-tested
- Most review comments can be addressed without major architectural changes
- The _setupMockInterceptors method is functional and just needs better documentation
- Focus should be on enhancing configurability rather than core functionality changes