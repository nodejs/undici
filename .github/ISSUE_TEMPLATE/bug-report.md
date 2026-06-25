---
name: Bug Report
about: Report an issue
title: ''
labels: bug
assignees: ''

---

## Bug Description

<!-- A clear and concise description of what the bug is. -->

## Reproduction

<!-- 
IMPORTANT: Provide a standalone reproduction script.

See the Reproduction guide in CONTRIBUTING.md for detailed instructions:
https://github.com/nodejs/undici/blob/main/CONTRIBUTING.md#reproduction

Guidelines:
- The script must be self-contained (uses only undici and Node.js built-in modules).
- Use createServer from node:http to run a local server inside the script.
- Run `node --test test/repro-XXXX.js` locally to confirm the bug is reproducible.
- Attach the script inline or as a GitHub Gist link below.
-->

**Standalone reproduction script:**

```javascript
'use strict'

// Paste your standalone reproduction script here.
// Example structure:
//
// const { test, after } = require('node:test')
// const { createServer } = require('node:http')
// const { once } = require('node:events')
// const { Client } = require('undici')
//
// test('bug reproduction', { timeout: 60000 }, async (t) => {
//   const { tspl } = require('@matteo.collina/tspl')
//   t = tspl(t, { plan: 1 })
//
//   const server = createServer(...)
//   ...
// })
```

**Steps to reproduce (if not using the script above):**

<!-- A step by step list on how the bug can be reproduced for examination. -->

## Expected Behavior

<!-- A clear and concise description of what you expected to happen. -->

## Actual Behavior

<!-- What actually happens instead. Include any error messages. -->

## Logs & Screenshots

<!-- If applicable, add screenshots to help explain your problem, or
alternatively add your console logs here. -->

## Environment

- OS: <!-- e.g. Ubuntu 24.04 LTS -->
- Node.js version: <!-- e.g. v22.14.0 -->
- undici version: <!-- e.g. 7.x.x (run `node -e 'require("undici/package.json").version'`) -->

### Additional context

<!-- Add any other context about the problem here. -->
