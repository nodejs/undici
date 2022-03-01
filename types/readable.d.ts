import { Readable } from "stream";

export = BodyReadable

declare class BodyReadable extends Readable {
  constructor(
    resume: (this: Readable, size: number) => void | null,
    abort: () => void | null,
    contentType: string
  )
  /** Dumps the response body by reading `limit` number of bytes.
   * @param opts.limit Number of bytes to read (optional) - Default: 262144
   */
  dump(opts?: { limit: number }): Promise<void>
}
