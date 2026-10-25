import { randomBytes, createHash } from "crypto";

const TOKEN_BYTES = 32;
const PREFIX_LENGTH = 6;

export interface GeneratedInviteToken {
  /** Trả cho client MỘT LẦN duy nhất lúc tạo — BE không lưu lại. */
  token: string;
  tokenHash: string;
  tokenPrefix: string;
}

/** 32 byte ngẫu nhiên → base64url (43 ký tự, không đệm) — be.md p1-02 §5.1/§9. */
export function generateInviteToken(): GeneratedInviteToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashInviteToken(token), tokenPrefix: token.slice(0, PREFIX_LENGTH) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
