# Class: RedirectPool

Extends: `Pool`

A pool which will automatically follow redirections.

When used, the option `maxRedirections` can be additionally provided to top level `request`, `stream` and `pipeline`. The option must a positive number:

* If omitted, up to 10 redirections are followed.

* If set to a positive number, it specifies the maximum number of redirections to follow.

The data returned by the top-level method (via callback or promise) will contain the additional property `redirections` that lists all the followed redirections, in order.

## Restrictions

For memory and performance reason, undici never copies or duplicates the request body in memory. When dealing with redirections (which means using `RedirectPool`), this leads to the following restrictions:

1. Use `undici.pipeline` with a `RedirectPool`.
2. Use `undici.request` or `undici.stream` with a `RedirectPool` passing a stream as request body. Note the passing strings or buffers is still allowed.

# Function: redirectPoolFactory

A factory function which returns a `RedirectPool` for a specific URL.

Arguments:

* **url** `URL | string` - It should only include the **protocol, hostname, and port**.
* **options** `PoolOptions` (optional)

Returns: `RedirectPool` - The pool to be used by the agent.