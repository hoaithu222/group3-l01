import { generateInviteToken, hashInviteToken } from "../services/invite-token.util";

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

describe("invite-token.util", () => {
  it("generateInviteToken(): token 43 ký tự base64url (32 byte, không đệm) — be.md §5.1/§9", () => {
    const { token } = generateInviteToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(BASE64URL_43);
    expect(token).not.toContain("=");
  });

  it("generateInviteToken(): tokenPrefix = 6 ký tự đầu của token", () => {
    const { token, tokenPrefix } = generateInviteToken();
    expect(tokenPrefix).toHaveLength(6);
    expect(tokenPrefix).toBe(token.slice(0, 6));
  });

  it("generateInviteToken(): tokenHash = sha256(token) — 64 hex ký tự", () => {
    const { token, tokenHash } = generateInviteToken();
    expect(tokenHash).toMatch(SHA256_HEX);
    expect(tokenHash).toBe(hashInviteToken(token));
  });

  it("generateInviteToken(): 2 lần gọi liên tiếp → token/hash khác nhau (ngẫu nhiên thật)", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("hashInviteToken(): ổn định — cùng input luôn ra cùng hash", () => {
    const { token } = generateInviteToken();
    const h1 = hashInviteToken(token);
    const h2 = hashInviteToken(token);
    expect(h1).toBe(h2);
  });

  it("hashInviteToken(): input khác nhau → hash khác nhau", () => {
    expect(hashInviteToken("token-a")).not.toBe(hashInviteToken("token-b"));
  });
});
