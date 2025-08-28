export async function setupHostsFile () {
  const makeHostsProc = spawn('python3', ['wpt', 'make-hosts-file'], {
    cwd: WPT_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stdout = ''
  makeHostsProc.stdout.on('data', (data) => {
    stdout += data.toString()
  })

  const success = await new Promise(resolve => {
    makeHostsProc.on('exit', code => resolve(code === 0))
  })

  if (success) {
    try {
      const entries = '\n\n# Configured for Web Platform Tests (Node.js)\n' + stdout
      writeFileSync(hostsPath, entries, { flag: 'a' })
      console.log(`Updated ${hostsPath}`)
    } catch (err) {
      console.error(`Failed to write to ${hostsPath}. Please run with sudo or configure manually.`)
      throw err
    }
  } else {
    throw new Error('Failed to generate hosts entries')
  }
}
