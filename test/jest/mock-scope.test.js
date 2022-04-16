const { MockAgent, setGlobalDispatcher, request } = require('../../index')

/* global afterAll, expect, it, AbortController */

const runIf = (condition) => condition ? it : it.skip

const nodeMajor = Number(process.versions.node.split('.', 1)[0])
const mockAgent = new MockAgent()

afterAll(async () => {
  await mockAgent.close()
})

runIf(nodeMajor >= 16)('Jest works with MockScope.delay - issue #1327', async () => {
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)

  const mockPool = mockAgent.get('http://localhost:3333')

  mockPool.intercept({
    path: '/jest-bugs',
    method: 'GET'
  }).reply(200, 'Hello').delay(100)

  const ac = new AbortController()
  setTimeout(() => ac.abort(), 5)
  const promise = request('http://localhost:3333/jest-bugs', {
    signal: ac.signal
  })

  await expect(promise).rejects.toThrowError('Request aborted')
}, 1000)
