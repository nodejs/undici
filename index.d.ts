import Pool from './types/pool'
import Client from './types/client'
import errors from './types/errors'

export { Pool, Client, errors }
export default Undici

declare function Undici(url: string, opts: Pool.Options): Pool

declare namespace Undici {
  var Pool: typeof import('./types/pool');
  var Client: typeof import('./types/client');
  var errors: typeof import('./types/errors');
}
