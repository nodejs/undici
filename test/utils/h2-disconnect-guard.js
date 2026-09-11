'use strict'

// The client drops an idle h2 socket itself once keepAliveTimeout elapses and
// reconnects transparently on the next request. A saturated CI runner can
// stretch the gap between two requests past that deadline, so this is a
// disconnect the test caused, not one the peer forced on it.
const SELF_INFLICTED_DISCONNECTS = new Set([
  'socket idle timeout'
])

// Fails `t` when the client loses its connection for a reason the test did not
// ask for. Returns a function that removes the guard.
function guardAgainstUnexpectedDisconnect (t, client) {
  const onDisconnect = (_url, _targets, err) => {
    if (client.closed || client.destroyed) {
      return
    }

    if (err != null && SELF_INFLICTED_DISCONNECTS.has(err.message)) {
      return
    }

    t.fail(`unexpected disconnect: ${err?.message ?? 'no error'}`)
  }

  client.on('disconnect', onDisconnect)

  return () => client.off('disconnect', onDisconnect)
}

module.exports = { guardAgainstUnexpectedDisconnect }
