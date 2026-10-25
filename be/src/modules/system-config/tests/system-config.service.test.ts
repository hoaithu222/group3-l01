/**
 * Unit — `SystemConfigService` trên `InMemorySystemConfigRepository` (CFG-04,
 * CFG-05, CFG-09 be.md §10). Mock `RuntimeConfigService.publishInvalidate`
 * (infra Redis) — test này chỉ kiểm nghiệp vụ version/validate, không phải
 * hành vi cache/pub-sub (xem `runtime-config.test.ts`).
 */
jest.mock("../../../core/config/runtime-config", () => ({
  runtimeConfig: {
    publishInvalidate: jest.fn().mockResolvedValue(undefined),
    getEffective: jest.fn().mockResolvedValue({}),
  },
}));

// Danh sách phân hệ "đã có mã" thật (`AVAILABLE_MODULES`) đổi theo lịch bàn giao từng phase — cố định một bản cho test này để
// ca "chưa available" không hỏng mỗi khi một phân hệ mới được thêm. Chỉ đổi danh sách, mọi export khác giữ nguyên.
jest.mock("../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../core/constants/modules");
  return {
    ...actual,
    AVAILABLE_MODULES: [actual.MODULES.PUSH, actual.MODULES.VOICE, actual.MODULES.MEETING],
  };
});

import { env } from "../../../core/config";
import { SystemConfigService } from "../services/system-config.service";
import { InMemorySystemConfigRepository } from "../repositories/system-config.repository.inmemory";
import {
  SystemConfigNotFoundError,
  SystemConfigOutOfRangeError,
  FeatureNotAvailableError,
  FeatureBlockedError,
  VersionConflictError,
} from "../../../core/exceptions";

describe("SystemConfigService", () => {
  const actor = { id: "507f1f77bcf86cd799439011", role: "admin" };
  let repo: InMemorySystemConfigRepository;
  let audit: { record: jest.Mock };
  let service: SystemConfigService;

  const livekitKeys = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;
  const originalLivekit = Object.fromEntries(livekitKeys.map((k) => [k, env[k]]));

  /** `env` là đối tượng đã parse lúc import — đặt thẳng để ca không phụ thuộc `process.env`/`be/.env` của người chạy. */
  const setLiveKitEnv = (on: boolean): void => {
    env.LIVEKIT_URL = on ? "http://livekit.test:7880" : undefined;
    env.LIVEKIT_API_KEY = on ? "devkey" : undefined;
    env.LIVEKIT_API_SECRET = on ? "devsecret" : undefined;
  };

  beforeEach(() => {
    repo = new InMemorySystemConfigRepository();
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new SystemConfigService(repo, audit);
    setLiveKitEnv(false);
  });

  afterEach(() => {
    Object.assign(env, originalLivekit);
  });

  it("khoá không có trong registry → SystemConfigNotFoundError (CFG_001)", async () => {
    await expect(service.getOne("khong-ton-tai")).rejects.toBeInstanceOf(SystemConfigNotFoundError);
  });

  it("CFG-05: tạo mới khi chưa có document (expectedVersion=0)", async () => {
    const dto = await service.update(
      "limits.message",
      { value: { maxChars: 2000 }, expectedVersion: 0, reason: "Giảm trần tin nhắn theo yêu cầu" },
      actor
    );
    expect(dto.version).toBe(1);
    expect(dto.stored.maxChars).toBe(2000);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "system-config.update", targetId: "limits.message" })
    );
  });

  it("CFG-05: version lệch → VersionConflictError (RES_003), không ghi đè", async () => {
    await service.update(
      "limits.message",
      { value: { maxChars: 2000 }, expectedVersion: 0, reason: "Giảm trần tin nhắn theo yêu cầu" },
      actor
    );
    await expect(
      service.update(
        "limits.message",
        { value: { maxChars: 1000 }, expectedVersion: 0, reason: "Một admin khác sửa cùng lúc" },
        actor
      )
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("CFG-04: giá trị vượt ceil → SystemConfigOutOfRangeError (CFG_002)", async () => {
    await expect(
      service.update(
        "limits.message",
        { value: { maxChars: 999999 }, expectedVersion: 0, reason: "Thử vượt trần cho phép" },
        actor
      )
    ).rejects.toBeInstanceOf(SystemConfigOutOfRangeError);
  });

  it("bật cờ module chưa available (chưa có mã) → FeatureNotAvailableError reason=not-available (CFG_003)", async () => {
    // `plagiarism` không nằm trong danh sách "đã có mã" cố định ở đầu file.
    const err = await service
      .update(
        "features",
        { value: { plagiarism: true }, expectedVersion: 0, reason: "Bật thử chống đạo văn cho toàn hệ thống" },
        actor
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FeatureNotAvailableError);
    expect((err as FeatureNotAvailableError).details).toEqual({ reason: "not-available" });
  });

  it("cờ PHỤ của tiện ích (p5-04) bật/tắt được dù phân hệ cha chưa có mã — không bị chặn 'not-available'", async () => {
    const off = await service.update(
      "features",
      { value: { workspaceSearch: false, readConfirm: true }, expectedVersion: 0, reason: "Tắt tìm toàn nhóm, giữ xác nhận đã đọc" },
      actor
    );
    expect(off.stored).toEqual({ workspaceSearch: false, readConfirm: true });
    // schema vẫn từ chối khoá lạ: chỉ ModuleId + cờ phụ hợp lệ
    await expect(
      service.update("features", { value: { khongTonTai: true }, expectedVersion: 1, reason: "Thử khoá lạ trong features" }, actor)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("bật cờ AI → FeatureBlockedError (CFG_004, D-13)", async () => {
    await expect(
      service.update(
        "features",
        { value: { ai: true }, expectedVersion: 0, reason: "Thử bật AI xem còn chặn không" },
        actor
      )
    ).rejects.toBeInstanceOf(FeatureBlockedError);
  });

  it("bật cờ push (available, không cần LiveKit) → thành công", async () => {
    const dto = await service.update(
      "features",
      { value: { push: true }, expectedVersion: 0, reason: "Bật thông báo đẩy cho toàn hệ thống" },
      actor
    );
    expect(dto.stored.push).toBe(true);
  });

  it("bật cờ voice/meeting (đã có mã) nhưng thiếu LIVEKIT_* → FeatureNotAvailableError reason=missing-env", async () => {
    for (const moduleId of ["voice", "meeting"] as const) {
      await expect(
        service.update(
          "features",
          { value: { [moduleId]: true }, expectedVersion: 0, reason: "Thử bật phân hệ media chưa cấu hình" },
          actor
        )
      ).rejects.toMatchObject({ details: { reason: "missing-env" } });
    }
  });

  it("bật cờ voice (đã có mã) khi đủ LIVEKIT_* → thành công", async () => {
    setLiveKitEnv(true);
    const dto = await service.update(
      "features",
      { value: { voice: true }, expectedVersion: 0, reason: "Bật gọi thoại khi LiveKit đã cấu hình" },
      actor
    );
    expect(dto.stored.voice).toBe(true);
  });

  it("reset: đưa value về {} và tăng version", async () => {
    await service.update(
      "limits.message",
      { value: { maxChars: 2000 }, expectedVersion: 0, reason: "Giảm trần tin nhắn theo yêu cầu" },
      actor
    );
    const dto = await service.reset("limits.message", { expectedVersion: 1, reason: "Đưa về mặc định hệ thống" }, actor);
    expect(dto.stored).toEqual({});
    expect(dto.version).toBe(2);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "system-config.reset" }));
  });
});
