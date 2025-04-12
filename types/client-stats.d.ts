import Client from './client'

export default ClientStats

declare class ClientStats {
  constructor (pool: Client)
  /** Number of open socket connections in this pool. */
  connected: number
  /** Number of open socket connections in this pool that do not have an active request. */
  pending: number
  /** Number of currently active requests across all clients in this pool. */
  running: number
  /** Number of active, pending, or queued requests across all clients in this pool. */
  size: number
}
