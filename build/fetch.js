const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

// Copied from: https://github.com/evanw/esbuild/issues/859#issuecomment-829154955
const nodeModules = /^(?:.*[\\/])?node_modules(?:[\\/].*)?$/

const dirnamePlugin = {
  name: 'dirname',
  setup (build) {
    build.onLoad({ filter: /.*/ }, ({ path: filePath }) => {
      if (!filePath.match(nodeModules)) {
        let contents = fs.readFileSync(filePath, 'utf8')
        const loader = path.extname(filePath).substring(1)
        const dirname = path.dirname(filePath)
        contents = contents
          .replace('__dirname', `"${dirname}"`)
          .replace('__filename', `"${filePath}"`)
        return {
          contents,
          loader
        }
      }
    })
  }
}

esbuild.build({
  platform: 'node',
  entryPoints: [path.resolve('index-fetch.js')],
  bundle: true,
  outfile: path.resolve('undici-fetch.js'),
  plugins: [dirnamePlugin]
}).then(() => {
  console.log('Build complete.')
})
