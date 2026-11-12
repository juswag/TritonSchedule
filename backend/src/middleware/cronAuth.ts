import { createHash, timingSafeEqual } from "node:crypto";

export function cronAuthorized(
  authorization: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;

  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256").update(authorization ?? "").digest();
  return timingSafeEqual(expected, actual);
}
