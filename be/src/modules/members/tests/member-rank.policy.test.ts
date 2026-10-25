import { rankOf, outranks } from "../services/member-rank.policy";
import type { WorkspaceRoleValue } from "../entities/member.interface";

describe("member-rank.policy", () => {
  it("rankOf(): OWNER > ADMIN > MEMBER > GUEST", () => {
    expect(rankOf("OWNER")).toBe(3);
    expect(rankOf("ADMIN")).toBe(2);
    expect(rankOf("MEMBER")).toBe(1);
    expect(rankOf("GUEST")).toBe(0);
  });

  // be.md p1-02 §6 — ma trận bậc quyền đầy đủ (4x4): actor CHỈ outrank khi bậc
  // STRICTLY cao hơn (không ngang hàng).
  const roles: WorkspaceRoleValue[] = ["OWNER", "ADMIN", "MEMBER", "GUEST"];
  const expected: Record<WorkspaceRoleValue, Partial<Record<WorkspaceRoleValue, boolean>>> = {
    OWNER: { OWNER: false, ADMIN: true, MEMBER: true, GUEST: true },
    ADMIN: { OWNER: false, ADMIN: false, MEMBER: true, GUEST: true },
    MEMBER: { OWNER: false, ADMIN: false, MEMBER: false, GUEST: true },
    GUEST: { OWNER: false, ADMIN: false, MEMBER: false, GUEST: false },
  };

  for (const actor of roles) {
    for (const target of roles) {
      it(`outranks(${actor}, ${target}) === ${expected[actor][target]}`, () => {
        expect(outranks(actor, target)).toBe(expected[actor][target]);
      });
    }
  }
});
