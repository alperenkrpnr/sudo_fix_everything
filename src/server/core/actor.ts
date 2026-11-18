// Actor = who is calling the service layer. Every service operation takes one.
// A human user: kullanici(id). An AI agent acting on behalf of a user: ajan(id, ...).

export type AjanKapsami = 'okuma' | 'yazma';

export interface Actor {
  kullaniciId: string;
  /** Present when an AI agent (REST/MCP token) acts on behalf of `kullaniciId`. */
  ajan?: { tokenId: string; kapsamlar: AjanKapsami[] };
}

export function kullanici(kullaniciId: string): Actor {
  return { kullaniciId };
}

/** Agent tokens are read-only by default. */
export function ajan(
  kullaniciId: string,
  opts: { tokenId?: string; kapsamlar?: AjanKapsami[] } = {},
): Actor {
  return { kullaniciId, ajan: { tokenId: opts.tokenId ?? 'ajan-token', kapsamlar: opts.kapsamlar ?? ['okuma'] } };
}
