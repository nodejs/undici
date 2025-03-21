'use strict'

// Called from .github/workflows

// The following two variables should be updated per major version release branch (main, v5.x, etc)
const VERSION_TAG_PREFIX = 'v5.'
const BRANCH = 'v5.x'

const getLatestRelease = async ({ github, owner, repo }) => {
  for await (const { data } of github.paginate.iterator(
    github.rest.repos.listReleases,
    {
      owner,
      repo
    }
  )) {
    const latestRelease = data.find((r) => r.tag_name.startsWith(VERSION_TAG_PREFIX))

    if (latestRelease) {
      return latestRelease
    }
  }

  throw new Error(`Could not find latest release of ${VERSION_TAG_PREFIX}x`)
}

const generateReleaseNotes = async ({ github, owner, repo, versionTag }) => {
  const previousRelease = await getLatestRelease({ github, owner, repo, versionTag })

  const { data: { body } } = await github.rest.repos.generateReleaseNotes({
    owner,
    repo,
    tag_name: versionTag,
    target_commitish: `heads/${BRANCH}`,
    previous_tag_name: previousRelease.tag_name
  })

  const bodyWithoutReleasePr = body.split('\n')
    .filter((line) => !line.includes('[Release] v'))
    .join('\n')

  return bodyWithoutReleasePr
}

const generatePr = async ({ github, context, versionTag }) => {
  const { owner, repo } = context.repo
  const releaseNotes = await generateReleaseNotes({ github, owner, repo, versionTag })

  await github.rest.pulls.create({
    owner,
    repo,
    head: `release/${versionTag}`,
    base: BRANCH,
    title: `[Release] ${versionTag}`,
    body: releaseNotes
  })
}

const release = async ({ github, context, versionTag }) => {
  const { owner, repo } = context.repo
  const releaseNotes = await generateReleaseNotes({ github, owner, repo, versionTag })

  await github.rest.repos.createRelease({
    owner,
    repo,
    tag_name: versionTag,
    target_commitish: BRANCH,
    name: versionTag,
    body: releaseNotes,
    draft: false,
    prerelease: false,
    generate_release_notes: false
  })

  try {
    await github.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/release/${versionTag}`
    })
  } catch (err) {
    console.log("Couldn't delete release PR ref")
    console.log(err)
  }
}

const previousReleaseTag = async ({ github, context, versionTag }) => {
  const { owner, repo } = context.repo
  const previousRelease = await getLatestRelease({ github, owner, repo, versionTag })
  return previousRelease.tag_name
}

module.exports = {
  release,
  previousReleaseTag,
  generatePr
}
