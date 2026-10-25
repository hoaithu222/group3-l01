/**
 * Unit — `toAuthUserDto().avatar` (p0-01 §5.6, nay dùng `shared/media`): URL ảnh hiển thị TUYỆT ĐỐI ký sẵn
 * `…/api/v1/assets/<avatarAssetId>/image?v=THUMB&e=&s=` (client dùng thẳng làm nguồn ảnh, không Bearer) — KHÔNG còn đường dẫn tương đối
 * `/api/v1/users/:id/avatar?v=`; chưa đặt ảnh → `null`; tham số `avatarUrl` tường minh vẫn thắng.
 */
import { env } from "../../../core/config";
import { verifyDisplayImageSignature } from "../../../shared/media";
import { toAuthUserDto } from "../dtos/auth-user.dto";
import type { User } from "../../users/entities/user.interface";

const USER_ID = "65f00000000000000000dd01";
const AVATAR = "65f00000000000000000dd02";

function user(over: Partial<User> = {}): User {
  return { id: USER_ID, email: "an@example.com", name: "An", role: "user", createdAt: new Date(), updatedAt: new Date(), ...over };
}

describe("toAuthUserDto — avatar", () => {
  const originalApiUrl = env.PUBLIC_API_URL;
  beforeEach(() => {
    env.PUBLIC_API_URL = "https://api.example.test/";
  });
  afterEach(() => {
    env.PUBLIC_API_URL = originalApiUrl;
  });

  it("có avatarAssetId → URL tuyệt đối ký sẵn bản THUMB của asset (không phải /users/:id/avatar), chữ ký hợp lệ", () => {
    const { avatar } = toAuthUserDto(user({ avatarAssetId: AVATAR }));

    expect(avatar).toMatch(new RegExp(`^https://api\\.example\\.test/api/v1/assets/${AVATAR}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`));
    expect(avatar).not.toContain("/api/v1/users/");
    const url = new URL(avatar ?? "");
    expect(verifyDisplayImageSignature(AVATAR, Number(url.searchParams.get("e")), url.searchParams.get("s") ?? "")).toBe(true);
  });

  it("chưa đặt ảnh (null/vắng) → avatar null", () => {
    expect(toAuthUserDto(user({ avatarAssetId: null })).avatar).toBeNull();
    expect(toAuthUserDto(user()).avatar).toBeNull();
  });

  it("avatarUrl truyền tường minh thắng URL dựng từ avatarAssetId", () => {
    expect(toAuthUserDto(user({ avatarAssetId: AVATAR }), [], "https://cdn.example.test/a.png").avatar).toBe("https://cdn.example.test/a.png");
  });
});
