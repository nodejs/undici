/**
 * The helper function to create a promise with resolvers.
 * Please see https://github.com/tc39/proposal-promise-with-resolvers for more details.
 */
function promiseWithResolvers () {
  let _resolve, _reject
  const promise = new Promise((resolve, reject) => {
    _resolve = resolve
    _reject = reject
  })
  return { promise, resolve: _resolve, reject: _reject }
}

module.exports = {
  promiseWithResolvers
}
