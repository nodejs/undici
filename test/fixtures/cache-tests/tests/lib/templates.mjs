/*
makeTemplate(template)

templates take an optional request object; the template
will be updated with the request object in the following manner:

- Object members will be assigned from the request
- Array members will be concatenated from the request
- Other members will be updated from the request
*/
export function makeTemplate (template) {
  return function (request) {
    return mergeDeep({}, template, request)
  }
}

function isObject (item) {
  return (item && typeof item === 'object' && !Array.isArray(item))
}

function mergeDeep (target, ...sources) {
  if (!sources.length) return target
  const source = sources.shift()

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} })
        mergeDeep(target[key], source[key])
      } else if (Array.isArray(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: [] })
        Object.assign(target, { [key]: target[key].concat(source[key]) })
      } else {
        Object.assign(target, { [key]: source[key] })
      }
    }
  }

  return mergeDeep(target, ...sources)
}

/*
 Templates below are shared between multiple suites;
 suite-specific tests should go in that file.
*/

export const fresh = makeTemplate({
  response_headers: [
    ['Cache-Control', 'max-age=100000'],
    ['Date', 0]
  ],
  setup: true,
  pause_after: true
})

export const stale = makeTemplate({
  response_headers: [
    ['Expires', -5000],
    ['Last-Modified', -100000],
    ['Date', 0]
  ],
  setup: true,
  pause_after: true
})

export const becomeStale = makeTemplate({
  response_headers: [
    ['Cache-Control', 'max-age=2'],
    ['Date', 0],
    ['Template-A', '1']
  ],
  setup: true,
  pause_after: true
})
