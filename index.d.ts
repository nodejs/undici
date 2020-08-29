import Pool from './types/pool'
import Client from './types/client'

export { Pool, Client }
export default Undici

declare function Undici(url: string, opts: Pool.Options): Pool

declare namespace Undici {
	var Pool: typeof import('./types/pool');
	var Client: typeof import('./types/client');
}
