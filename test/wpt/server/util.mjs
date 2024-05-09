import { symbols } from './constants.mjs'

// Adapted from
// https://github.com/web-platform-tests/wpt/blob/a9f92afbb621a71872388c843858553808bb9fa6/tools/wptserve/wptserve/pipes.py

class ReplacementTokenizer {
  constructor () {
    this.tokenTypes = [
      [/\$\w+:/, this.var.bind(this)],
      [/\$?\w+/, this.ident.bind(this)],
      [/\[[^\]]*\]/, this.index.bind(this)],
      [/\([^)]*\)/, this.arguments.bind(this)]
    ]
  }

  arguments (token) {
    const unwrapped = token.slice(1, -1)
    const args = unwrapped.toString('utf8').split(/,\s*/)
    return ['arguments', args]
  }

  ident (token) {
    const value = token.toString('utf8')
    return ['ident', value]
  }

  index (token) {
    let value = token.slice(1, -1).toString('utf8')
    value = isNaN(value) ? value : parseInt(value)
    return ['index', value]
  }

  var (token) {
    const value = token.slice(0, -1).toString('utf8')
    return ['var', value]
  }

  tokenize (string) {
    const tokens = []
    while (string.length > 0) {
      let matched = false
      for (const [pattern, handler] of this.tokenTypes) {
        const match = string.match(pattern)
        if (match) {
          tokens.push(handler(match[0]))
          string = string.slice(match[0].length)
          matched = true
          break
        }
      }
      if (!matched) {
        throw new Error(`Invalid token at position ${string}`)
      }
    }
    return tokens
  }
}

class PipeTokenizer {
  constructor () {
    this.state = null
    this.string = ''
    this.index = 0
  }

  * tokenize (string) {
    this.string = string
    this.state = this.funcNameState
    this.index = 0
    while (this.state) {
      yield this.state()
    }
    yield null
  }

  getChar () {
    if (this.index >= this.string.length) {
      return null
    }
    const char = this.string[this.index]
    this.index++
    return char
  }

  funcNameState () {
    let rv = ''
    while (true) {
      const char = this.getChar()
      if (char === null) {
        this.state = null
        if (rv) {
          return ['function', rv]
        } else {
          return null
        }
      } else if (char === '(') {
        this.state = this.argumentState
        return ['function', rv]
      } else if (char === '|') {
        if (rv) {
          return ['function', rv]
        }
      } else {
        rv += char
      }
    }
  }

  argumentState () {
    let rv = ''
    while (true) {
      const char = this.getChar()
      if (char === null) {
        // this.state = null;
        return ['argument', rv]
      } else if (char === '\\') {
        rv += this.getEscape()
        if (rv === null) {
          // This should perhaps be an error instead
          return ['argument', rv]
        }
      } else if (char === ',') {
        return ['argument', rv]
      } else if (char === ')') {
        this.state = this.funcNameState
        return ['argument', rv]
      } else {
        rv += char
      }
    }
  }

  getEscape () {
    const char = this.getChar()
    const escapes = {
      n: '\n',
      r: '\r',
      t: '\t'
    }
    return escapes[char] || char
  }
}

export class Pipeline {
  static pipes = {}

  constructor (pipeString) {
    this.pipeFunctions = this.parse(pipeString)
  }

  parse (pipeString) {
    const functions = []
    const tokenizer = new PipeTokenizer()
    for (const item of tokenizer.tokenize(pipeString)) {
      if (!item) {
        break
      }
      if (item[0] === 'function') {
        if (!Pipeline.pipes[item[1]]) {
          throw new Error(`Pipe function ${item[1]} is not implemented.`)
        }

        functions.push([Pipeline.pipes[item[1]], []])
      } else if (item[0] === 'argument') {
        functions[functions.length - 1][1].push(item[1])
      }
    }
    return functions
  }

  /**
   * @param {import('node:http').IncomingMessage} request
   * @param {import('node:http').ServerResponse} response
   * @returns
   */
  async call (request, response) {
    let res = response
    for (const [func, args] of this.pipeFunctions) {
      res = await func(request, res, ...args)
    }
    return res
  }
}

/**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
Pipeline.pipes.sub = async (req, res, escapeType = 'html') => {
  let content = ''

  for await (const chunk of req) {
    content += chunk
  }

  content = template(req, content)
  res[symbols.kContent] = content

  return res
}

Pipeline.pipes.slice = async (req, res, start, end = null) => {
  let content = ''

  for await (const chunk of req) {
    content += chunk
  }

  start ??= 0
  end ??= content.length
  content = content.slice(start, end)

  res.setHeader('content-length', `${content.length}`)
  res[symbols.kContent] = content

  return res
}

Pipeline.pipes.status = (req, res, code) => {
  res.statusCode = code
  return res
}

Pipeline.pipes.header = (req, res, name, value, append = false) => {
  if (!append) {
    res.setHeader(name, value)
  } else {
    res.appendHeader(name, value)
  }

  return res
}

function template (request, content, escapeType = 'html') {
  const tokenizer = new ReplacementTokenizer()
  const variables = {}

  function configReplacement (match) {
    const content = match
    const tokens = tokenizer.tokenize(content)
    const variable = null

    let [tokenType, field] = tokens.shift().split(':')
    let value

    if (!field) {
      field = tokenType
      tokenType = null
    }

    if (field === 'headers') {
      value = request.headers
    } else {
      throw new Error(`Undefined template variable: ${field}`)
    }

    while (tokens.length > 0) {
      const [ttype, tfield] = tokens.shift().split(':')
      if (ttype === 'index') {
        value = value[tfield]
      } else if (ttype === 'arguments') {
        const args = tfield.split(',')
        value = value(request, ...args)
      } else {
        throw new Error(`Unexpected token type: ${ttype}`)
      }
    }

    if (variable !== null) {
      variables[variable] = value
    }

    const escapeFunc = {
      html: (x) => escape(x),
      none: (x) => x
    }[escapeType]

    let result = value
    if (typeof result === 'object') {
      result = JSON.stringify(result)
    }

    return escapeFunc(result)
  }

  const templateRegexp = /{{([^}]*)}}/g
  const newContent = content.replace(templateRegexp, configReplacement)

  return newContent
}
