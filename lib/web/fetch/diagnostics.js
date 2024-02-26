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
  publishFetchAsyncEnd()
}

function publishFetchRequestError (request, error) {
  if (channels.fetchRequestError.hasSubscribers) {
    channels.fetchRequestError.publish({ request, error })
  }
  publishFetchAsyncEnd()
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

function publishFetchAsyncStart (request) {
  if (channels.fetchAsyncStart.hasSubscribers) {
    channels.fetchAsyncStart.publish()
  }
}

function publishFetchAsyncEnd () {
  if (channels.fetchAsyncEnd.hasSubscribers) {
    channels.fetchAsyncEnd.publish()
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
  publishFetchEnd,
  publishFetchAsyncStart,
  publishFetchAsyncEnd
}
