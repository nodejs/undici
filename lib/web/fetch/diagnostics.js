'use strict'

const channels = require('../../core/diagnostics.js').channels

function publishFetchAbort (request, abortError) {
  if (channels.fetchAbort.hasSubscribers) {
    channels.fetchAbort.publish({ request, error: abortError })
  }
}

function publishFetchRequest (request) {
  if (channels.fetchRequest.hasSubscribers) {
    channels.fetchRequest.publish({ request })
  }
}

function publishFetchError (error) {
  if (channels.fetchError.hasSubscribers) {
    channels.fetchError.publish({ error })
  }
  publishFetchEnd()
}

function publishFetchResponse (request, response) {
  if (channels.fetchResponse.hasSubscribers) {
    channels.fetchResponse.publish({ request, response })
  }
  publishFetchEnd()
}

function publishFetchRequestError (request, error) {
  if (channels.fetchRequestError.hasSubscribers) {
    channels.fetchRequestError.publish({ request, error })
  }
  publishFetchEnd()
}

function publishFetchRequestRedirect (request) {
  if (channels.fetchRequestRedirect.hasSubscribers) {
    channels.fetchRequestRedirect.publish({ request })
  }
}

function publishFetchStart (request) {
  if (channels.fetchStart.hasSubscribers) {
    channels.fetchStart.publish()
  }
}

function publishFetchEnd () {
  if (channels.fetchEnd.hasSubscribers) {
    channels.fetchEnd.publish()
  }
}

module.exports = {
  publishFetchAbort,
  publishFetchRequest,
  publishFetchError,
  publishFetchResponse,
  publishFetchRequestError,
  publishFetchRequestRedirect,
  publishFetchStart,
  publishFetchEnd
}
