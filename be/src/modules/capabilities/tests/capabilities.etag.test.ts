import { capabilitiesEtag } from "../capabilities.controller";
import { buildCapabilities } from "../capabilities.service";
import { resetRuntimeConfig } from "../../../core/config/runtime-config";

describe("capabilitiesEtag", () => {
  afterEach(() => {
    resetRuntimeConfig();
  });

  it("ổn định giữa hai lần dựng liên tiếp (serverNow đổi nhưng không tính vào ETag)", async () => {
    const a = await buildCapabilities();
    const b = { ...(await buildCapabilities()), serverNow: "2000-01-01T00:00:00.000Z" };

    expect(capabilitiesEtag(a)).toBe(capabilitiesEtag(b));
  });

  it("ĐỔI khi một cờ phân hệ đổi dù configVersion (băm SystemConfig) giữ nguyên", async () => {
    const before = await buildCapabilities();
    const after = {
      ...before,
      features: {
        ...before.features,
        communication: { ...before.features.communication, enabled: !before.features.communication.enabled },
      },
    };

    expect(after.configVersion).toBe(before.configVersion);
    expect(capabilitiesEtag(after)).not.toBe(capabilitiesEtag(before));
  });

  it("có dạng ETag mạnh trong ngoặc kép", async () => {
    expect(capabilitiesEtag(await buildCapabilities())).toMatch(/^"[0-9a-f]{40}"$/);
  });
});
