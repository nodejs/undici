import { URL } from 'url'
import Client from './client'

export = Pool

declare class Pool extends Client {
  constructor(url: string | URL, options?: Pool.Options)
}

declare namespace Pool {
  export interface Options extends Client.Options {
    /** The max number of clients to create. `null` if no limit. Default `null`. */
    connections?: number
  }
}
