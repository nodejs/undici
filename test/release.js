'use strict'

const { rejects, strictEqual } = require('node:assert')
const { test } = require('node:test')
const { getPreviousRelease, release } = require('../scripts/release')

test('getPreviousRelease uses the latest release from the current major line', () => {
  const previousRelease = getPreviousRelease({
    versionTag: 'v8.0.1',
    releases: [
      { tag_name: 'v8.0.0' },
      { tag_name: 'v7.16.0' }
    ]
  })

  strictEqual(previousRelease?.tag_name, 'v8.0.0')
})

test('getPreviousRelease ignores the current version tag', () => {
  const previousRelease = getPreviousRelease({
    versionTag: 'v8.0.1',
    releases: [
      { tag_name: 'v8.0.1' },
      { tag_name: 'v8.0.0' },
      { tag_name: 'v7.16.0' }
    ]
  })

  strictEqual(previousRelease?.tag_name, 'v8.0.0')
})

test('getPreviousRelease returns undefined when the current major has no previous releases', () => {
  const previousRelease = getPreviousRelease({
    versionTag: 'v8.0.0',
    releases: [
      { tag_name: 'v7.16.0' }
    ]
  })

  strictEqual(previousRelease, undefined)
})

const createGithub = (deleteRef) => ({
  rest: {
    repos: {
      listReleases: async () => ({ data: [] }),
      generateReleaseNotes: async () => ({ data: { body: 'Release notes' } }),
      createRelease: async () => {}
    },
    git: { deleteRef }
  }
})

const releaseArgs = {
  github: null,
  context: { repo: { owner: 'nodejs', repo: 'undici' } },
  versionTag: 'v8.0.0',
  commitHash: 'abc123'
}

test('release treats a missing release PR ref as a no-op', async () => {
  const github = createGithub(async () => {
    const error = new Error('Reference does not exist')
    error.status = 422
    error.response = { data: { message: 'Reference does not exist' } }
    throw error
  })

  await release({ ...releaseArgs, github })
})

test('release propagates other release PR ref deletion errors', async () => {
  const error = new Error('Forbidden')
  error.status = 403
  const github = createGithub(async () => {
    throw error
  })

  await rejects(release({ ...releaseArgs, github }), (actual) => actual === error)
})
