/**
 * The header type declaration of `undici`.
 */
export type IncomingHttpHeaders = Record<string, string | string[] | undefined>;

/**
 * The raw header type declaration of `undici`.
 */
export type IncomingRawHttpHeaders = Record<string, string | string[] | number | undefined>;
