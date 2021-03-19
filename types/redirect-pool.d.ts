import Client from './client'
import Pool from './pool'

declare class RedirectPool extends Pool {}
declare function redirectPoolFactory(url: string | URL, options?: Client.Options): RedirectPool

export { RedirectPool, redirectPoolFactory }
