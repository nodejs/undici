import * as esbuild from 'esbuild'
import fs from 'node:fs'

const exampleOnLoadPlugin = {
  name: 'example',
  setup (build) {
    // Load ".txt" files and return an array of words
    build.onLoad({ filter: /lib\/fetch\/index.js/ }, async (args) => {
      const text = await fs.promises.readFile(args.path, 'utf8')

      return {
        contents: `var esbuildDetection = 1;${text}`,
        loader: 'js'
      }
    })
  }
}

await esbuild.build({
  entryPoints: ['index-fetch.js'],
  bundle: true,
  outfile: 'undici-fetch.js',
  plugins: [exampleOnLoadPlugin],
  platform: 'node'
})
