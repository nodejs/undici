/**
 * The header type declaration of `undici`.
 */
export type IncomingHttpHeaders = Record<string, string | string[] | undefined>;

/**
 * The h2 pseudo-header type declaration of `undici`.
 */
export type IncomingH2PseudoHeaders = Record<':status', number | undefined> | Record<`:${string}`, string | number | string[] | undefined>;