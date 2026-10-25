import { buildCapabilities } from "../capabilities.service";
import { resetRuntimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";

/**
 * `buildCapabilities()` giờ ASYNC (đọc `RuntimeConfigService`, p0-07) —
 * không có `initRuntimeConfig()`/Redis trong unit test này → mọi khoá trả
 * "chỉ mặc định registry" (không override), đủ để khoá lại hình dạng response.
 */
describe("buildCapabilities", () => {
  afterEach(() => {
    resetRuntimeConfig();
  });

  it("module KHÔNG nằm trong AVAILABLE_MODULES → enabled=false, available=false (AI vẫn kèm blocked) — danh sách cố định bằng mock, không đổi theo lịch bàn giao phân hệ", async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock("../../../core/constants/modules", () => {
        const actual = jest.requireActual("../../../core/constants/modules");
        return { ...actual, AVAILABLE_MODULES: [actual.MODULES.PUSH] };
      });
      const { buildCapabilities: buildWithFixture } = await import("../capabilities.service");
      const cap = await buildWithFixture();
      expect(cap.features.push).toEqual({ enabled: false, available: true });
      for (const id of ["communication", "voice", "o2o", "plagiarism", "coins"] as const) {
        expect(cap.features[id]).toEqual({ enabled: false, available: false });
      }
      // Cờ phụ theo phân hệ cha: cha (communication) chưa có mã ⇒ cờ phụ available=false.
      expect(cap.features.workspaceSearch.available).toBe(false);
    });
  });

  it("o2o (p6-05) đã có mã → available=true, mặc định vẫn TẮT", async () => {
    const cap = await buildCapabilities();
    expect(cap.features.o2o).toEqual({ enabled: false, available: true });
  });

  it("mentor (p6-03) đã có mã → available=true, mặc định vẫn TẮT", async () => {
    const cap = await buildCapabilities();
    expect(cap.features.mentor).toEqual({ enabled: false, available: true });
  });

  it("career (p6-06) đã có mã → available=true, mặc định vẫn TẮT", async () => {
    const cap = await buildCapabilities();
    expect(cap.features.career).toEqual({ enabled: false, available: true });
  });

  it("module đã có mã (communication, voice…) available=true nhưng mặc định registry vẫn enabled=false", async () => {
    const cap = await buildCapabilities();
    expect(cap.features.communication).toEqual({ enabled: false, available: true });
    expect(cap.features.voice).toEqual({ enabled: false, available: true });
  });

  it("module AI có blocked: 'D-13'", async () => {
    const cap = await buildCapabilities();
    expect(cap.features.ai).toEqual({ enabled: false, available: false, blocked: "D-13" });
    expect(cap.features["ai-assistant"].blocked).toBe("D-13");
    expect(cap.features.knowledge.blocked).toBe("D-13");
  });

  it("cờ phụ p5-04 (workspaceSearch/workspaceTemplates/readConfirm): theo phân hệ cha communication — cha có mã nhưng đang tắt thì enabled=false, available=true", async () => {
    const cap = await buildCapabilities();
    for (const id of ["workspaceSearch", "workspaceTemplates", "readConfirm"] as const) {
      expect(cap.features[id]).toEqual({ enabled: false, available: true });
    }
  });

  it("cờ phụ p7-04: polls/scheduledMessages/messageReminders theo `communication`, messageToTask/messageToResource theo `project` (đều có mã, mặc định cha TẮT → enabled=false); `gif` luôn available=false (chưa có nhà cung cấp)", async () => {
    const cap = await buildCapabilities();
    for (const id of ["polls", "scheduledMessages", "messageReminders", "messageToTask", "messageToResource"] as const) {
      expect(cap.features[id]).toEqual({ enabled: false, available: true });
    }
    expect(cap.features.gif).toEqual({ enabled: false, available: false });
    // Giới hạn tiện ích chat có trong `limits` để app ẩn/khoá UI theo trần hiện hành.
    expect(cap.limits.poll).toMatchObject({ optionsMin: 2, optionsMax: 10, closesInMaxDays: 30 });
    expect(cap.limits.scheduledMessage).toMatchObject({ pendingPerUserMax: 50, sendAtMaxDays: 30, minLeadSeconds: 60 });
    expect(cap.limits.reminder).toMatchObject({ pendingPerUserMax: 100, remindAtMaxDays: 365 });
  });

  it("push (AVAILABLE_MODULES) có available=true", async () => {
    const cap = await buildCapabilities();
    expect(cap.features.push.available).toBe(true);
  });

  it("upload.maxFileBytes dương và không vượt trần LIMITS.upload.maxFileBytes (100 MiB)", async () => {
    const cap = await buildCapabilities();
    expect(cap.upload.maxFileBytes).toBeLessThanOrEqual(100 * 1024 * 1024);
    expect(cap.upload.maxFileBytes).toBeGreaterThan(0);
  });

  it("upload.allowedMime gộp đủ mime của mọi kind (vd ảnh, voice)", async () => {
    const cap = await buildCapabilities();
    expect(cap.upload.allowedMime).toContain("image/png");
    expect(cap.upload.allowedMime).toContain("audio/aac");
  });

  it("upload.scopeMime (p3-01): scope RESOURCE nhận thêm markdown/json; là bản sao của LIMITS, không có HTML/SVG/executable", async () => {
    const cap = await buildCapabilities();
    expect(cap.upload.scopeMime.RESOURCE).toEqual(expect.arrayContaining(["text/markdown", "application/json"]));
    expect(cap.upload.scopeMime.RESOURCE).toEqual([...LIMITS.upload.scopeMime.RESOURCE]);
    expect(cap.upload.scopeMime.RESOURCE).not.toBe(LIMITS.upload.scopeMime.RESOURCE);
    for (const mimes of Object.values(cap.upload.scopeMime)) {
      for (const mime of mimes) expect(mime).not.toMatch(/html|svg|javascript|executable|x-msdownload/i);
    }
    // TASK/TASK_COMMENT không khai MIME bổ sung → không có khoá riêng (dùng allowlist chung).
    expect(cap.upload.scopeMime.TASK).toBeUndefined();
  });

  it("trả về version, configVersion, serverNow và limits", async () => {
    const cap = await buildCapabilities();
    expect(cap.version).toBeDefined();
    expect(cap.configVersion).toEqual(expect.any(String));
    expect(cap.serverNow).toEqual(expect.any(String));
    expect(cap.limits.pagination.default).toBe(30);
  });

  it("auth: mặc định registry (biometricLogin bật, appLock bật, lockAfterBackgroundSeconds mặc định)", async () => {
    const cap = await buildCapabilities();
    expect(cap.auth.biometricLogin.enabled).toBe(true);
    expect(cap.auth.appLock.enabled).toBe(true);
    expect(cap.auth.appLock.lockAfterBackgroundSeconds).toBe(300);
  });
});
