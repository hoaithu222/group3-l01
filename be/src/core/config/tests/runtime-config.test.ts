/**
 * Unit — `RuntimeConfigService` (p0-07 §5.2). `redis` mock từ `src/tests/global-setup.ts`
 * (`get`/`set`/`del` không trả gì → coi như cache miss/no-op) — mọi test ở
 * đây kiểm hành vi merge/clamp/fallback qua `ISystemConfigReader` giả, không
 * qua Redis/Mongo thật (xem `tests/integration/system-config.routes.test.ts`
 * cho hành vi 2-instance qua Redis thật).
 */
// Cờ env của mọi phân hệ = TẮT (mặc định của repo), KHÔNG đọc `FEATURE_FLAGS` của `be/.env` người chạy — các ca "env × stored × available" bên dưới
// cần tiền đề env xác định. Cách mock + thứ tự nạp `../index` như `runtime-config.subfeature.test.ts` (`constants/modules` ↔ `validate-runtime` import vòng).
jest.mock("../../constants/modules", () => {
  const actual = jest.requireActual("../../constants/modules");
  return { ...actual, FEATURE_FLAGS: { ...actual.DEFAULT_FEATURE_FLAGS } };
});

import "../index";
import {
  getEffective,
  getLimits,
  isFeatureEnabled,
  get,
  configVersion,
  initRuntimeConfig,
  resetRuntimeConfig,
  type ISystemConfigReader,
  type SystemConfigSnapshot,
} from "../runtime-config";
import { LIMITS } from "../../constants/limits";
import { MODULES } from "../../constants/modules";

function fakeReader(data: Record<string, SystemConfigSnapshot>): ISystemConfigReader {
  return {
    async findByKey(key: string) {
      return data[key] ?? null;
    },
  };
}

describe("RuntimeConfigService", () => {
  afterEach(() => {
    resetRuntimeConfig();
  });

  it("không có override (reader rỗng) → getEffective trả mặc định registry", async () => {
    initRuntimeConfig(fakeReader({}));
    const effective = await getEffective("limits.message");
    expect(effective.maxChars).toBe(LIMITS.message.maxChars);
    expect(effective.voiceNoteMaxSeconds).toBe(LIMITS.message.voiceNoteMaxSeconds);
  });

  it("có override hợp lệ → getEffective phản ánh giá trị đã lưu", async () => {
    initRuntimeConfig(fakeReader({ "limits.message": { value: { maxChars: 2000 }, version: 2 } }));
    const effective = await getEffective("limits.message");
    expect(effective.maxChars).toBe(2000);
    // field khác không override vẫn giữ mặc định
    expect(effective.attachmentsMax).toBe(LIMITS.message.attachmentsMax);
  });

  it("override vượt ceil đã lưu trước đó (vd env giảm trần sau) → getEffective CLAMP âm thầm", async () => {
    initRuntimeConfig(fakeReader({ "limits.message": { value: { maxChars: 999999 }, version: 1 } }));
    const effective = await getEffective("limits.message");
    expect(effective.maxChars).toBe(LIMITS.message.maxChars); // ceil = LIMITS.message.maxChars
  });

  it("getLimits() merge mọi nhóm limits.* đã đăng ký, giữ nguyên nhóm không đăng ký (vd voice)", async () => {
    initRuntimeConfig(fakeReader({ "limits.call": { value: { maxParticipants: 4 }, version: 1 } }));
    const limits = await getLimits();
    expect(limits.call.maxParticipants).toBe(4);
    expect(limits.call.ringTimeoutSeconds).toBe(LIMITS.call.ringTimeoutSeconds);
    expect(limits.voice).toEqual(LIMITS.voice);
  });

  describe("isFeatureEnabled — 8 tổ hợp env × stored × available (CFG-09)", () => {
    it("push: available, không override, env test không bật FEATURE_FLAGS → false (mặc định env)", async () => {
      initRuntimeConfig(fakeReader({}));
      expect(await isFeatureEnabled(MODULES.PUSH)).toBe(false);
    });

    it("push: available, override bật cưỡng → true dù env tắt", async () => {
      initRuntimeConfig(fakeReader({ features: { value: { push: true }, version: 1 } }));
      expect(await isFeatureEnabled(MODULES.PUSH)).toBe(true);
    });

    it("push: available, override tắt cưỡng → false dù env bật", async () => {
      initRuntimeConfig(fakeReader({ features: { value: { push: false }, version: 1 } }));
      expect(await isFeatureEnabled(MODULES.PUSH)).toBe(false);
    });

    it("custom-roles: override bật nhưng KHÔNG available → luôn false", async () => {
      // (p7-03) `burnout` đã có mã nên không còn là ví dụ "chưa available"; dùng `custom-roles` (chưa có mã).
      initRuntimeConfig(fakeReader({ features: { value: { "custom-roles": true }, version: 1 } }));
      expect(await isFeatureEnabled(MODULES.CUSTOM_ROLES)).toBe(false);
    });

    it("burnout: đã available → override bật thì bật (p7-03)", async () => {
      initRuntimeConfig(fakeReader({ features: { value: { burnout: true }, version: 1 } }));
      expect(await isFeatureEnabled(MODULES.BURNOUT)).toBe(true);
    });

    it("ai: override bật nhưng AI_BLOCKED (D-13) → luôn false", async () => {
      initRuntimeConfig(fakeReader({ features: { value: { ai: true }, version: 1 } }));
      expect(await isFeatureEnabled(MODULES.AI)).toBe(false);
    });
  });

  it("get('auth.biometricLogin.enabled') đọc đúng path lồng, mặc định true", async () => {
    initRuntimeConfig(fakeReader({}));
    expect(await get("auth.biometricLogin.enabled")).toBe(true);
  });

  it("get('auth.biometricLogin.enabled') → false khi admin tắt qua SystemConfig", async () => {
    initRuntimeConfig(fakeReader({ auth: { value: { biometricLogin: { enabled: false } }, version: 3 } }));
    expect(await get("auth.biometricLogin.enabled")).toBe(false);
  });

  it("configVersion() ổn định khi không có gì đổi, đổi khi version 1 khoá đổi", async () => {
    initRuntimeConfig(fakeReader({ "limits.message": { value: {}, version: 1 } }));
    const v1 = await configVersion();
    resetRuntimeConfig();
    initRuntimeConfig(fakeReader({ "limits.message": { value: {}, version: 2 } }));
    const v2 = await configVersion();
    expect(v1).not.toBe(v2);
  });

  it("reader ném lỗi (Mongo lỗi) → fail-open về mặc định, không throw", async () => {
    initRuntimeConfig({
      findByKey: async () => {
        throw new Error("Mongo down");
      },
    });
    const effective = await getEffective("limits.message");
    expect(effective.maxChars).toBe(LIMITS.message.maxChars);
  });
});
