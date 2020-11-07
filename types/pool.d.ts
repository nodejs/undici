import Client from './client'

export = Pool

declare class Pool extends Client {
	constructor(url: string, options?: Pool.Options)
}

declare namespace Pool {
	export interface Options extends Client.Options {
		/** The number of clients to create. Default `100`. */
		connections?: number
	}
}