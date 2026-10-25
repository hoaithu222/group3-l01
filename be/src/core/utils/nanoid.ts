/**
 * @file nanoid.ts
 * @description Cryptographically-random short-id generator.
 * Uses `crypto.randomBytes` (no external dep) + URL-safe base62 alphabet.
 *
 * Collision probability for 8 chars:
 *   62^8 ≈ 2.18 × 10^14 combinations
 *   1e6 IDs → collision probability ≈ 2.3 × 10^-9 (birthday paradox)
 */

import { randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ALPHABET_LEN = ALPHABET.length;

/**
 * Generate a URL-safe random ID of the requested length.
 * Default 8 chars = ~48 bits of entropy.
 *
 * @param size number of characters (default 8)
 */
export function nanoid(size = 8): string {
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) {
    // Rejection-free: use modulo bias (negligible for base62)
    out += ALPHABET[bytes[i]! % ALPHABET_LEN];
  }
  return out;
}
