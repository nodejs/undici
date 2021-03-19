# Class: RedirectPool

Extends: `Pool`

A pool which will automatically follow redirections.

When used, the option `maxRedirections` can be additionally provided to top level `request`, `stream` and `pipeline`. The option must a positive number:

* If omitted, up to 10 redirections are followed.

* If set to a positive number, it specifies the maximum number of redirections to follow.

The data returned by the top-level method (via callback or promise) will contain the additional property `redirections` that lists all the followed redirections, in order.

# Function: redirectPoolFactory

A factory function which returns a `RedirectPool` for a specific URL.

Arguments:

* **url** `URL | string` - It should only include the **protocol, hostname, and port**.
* **options** `PoolOptions` (optional)

Returns: `RedirectPool` - The pool to be used by the agent.