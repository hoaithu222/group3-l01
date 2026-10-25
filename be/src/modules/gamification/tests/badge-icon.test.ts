import { ForbiddenError, NotFoundError, VersionConflictError } from "../../../core/exceptions";
import { mimePolicy } from "../../assets/services/mime-policy";
import { clearAssetScopeGates, getAssetScopeGate } from "../../../shared/ports/asset-scope-gate.port";
import { clearAssetTargetReadResolvers, getAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import type { Badge, BadgeCreateInput } from "../entities/gamification.interface";
import type { IBadgeRepository } from "../repositories/badge.repository.interface";
import type { IGamDirectory } from "../repositories/directory";
import { UniqueViolationError, type ITxRunner, type TxHandle } from "../repositories/tx";
import { BadgeAdminService } from "../services/badge-admin.service";
import type { IGamBadgeIcons } from "../services/badge-icon.port";
import { registerGamificationIntegrations } from "../services/gamification-integrations";

const at = new Date("2026-09-01T00:00:00Z");
const badge = (over: Partial<Badge> = {}): Badge => ({
  id: "b1",
  code: "tasks-50",
  name: "Chăm chỉ",
  description: "",
  emoji: null,
  iconAssetId: null,
  criteria: { all: [{ counter: "tasksDone", op: "gte", value: 50 }] },
  counters: ["tasksDone"],
  rarity: "COMMON",
  isActive: true,
  order: 0,
  version: 1,
  createdBy: null,
  createdAt: at,
  updatedAt: at,
  ...over,
});

const actor = { id: "admin1", email: "a@x.vn", role: "admin" };
const criteria = { all: [{ counter: "tasksDone", op: "gte", value: 50 }] };
const TX = { marker: "tx" } as unknown as TxHandle;

function setup(existing: Badge | null = badge()) {
  const calls: string[] = [];
  const badges = {
    findById: jest.fn(() => Promise.resolve(existing)),
    create: jest.fn((input: BadgeCreateInput, tx?: TxHandle) => {
      calls.push(`create:${tx ? "tx" : "direct"}`);
      return Promise.resolve(badge({ id: "new1", code: input.code, iconAssetId: input.iconAssetId }));
    }),
    updateIf: jest.fn((id: string, v: number, patch: Partial<Badge>, tx?: TxHandle) => {
      calls.push(`update:${tx ? "tx" : "direct"}`);
      return Promise.resolve(v === existing?.version ? badge({ ...existing, ...patch, version: v + 1 }) : null);
    }),
  };
  const icons = {
    assertUsable: jest.fn<ReturnType<IGamBadgeIcons["assertUsable"]>, Parameters<IGamBadgeIcons["assertUsable"]>>(() => Promise.resolve()),
    attach: jest.fn<ReturnType<IGamBadgeIcons["attach"]>, Parameters<IGamBadgeIcons["attach"]>>(() => {
      calls.push("attach");
      return Promise.resolve();
    }),
    detach: jest.fn<ReturnType<IGamBadgeIcons["detach"]>, Parameters<IGamBadgeIcons["detach"]>>(() => {
      calls.push("detach");
      return Promise.resolve();
    }),
  } satisfies IGamBadgeIcons;
  const run = jest.fn(<T>(fn: (tx: TxHandle) => Promise<T>) => fn(TX));
  const tx = { run } as unknown as ITxRunner;
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const userBadges = { countByBadges: () => Promise.resolve(new Map<string, number>()) };
  const service = new BadgeAdminService({ badges: badges as unknown as IBadgeRepository, userBadges: userBadges as never, badgeService: {} as never, audit, jobs: {} as never, icons, tx });
  return { service, badges, icons, run, audit, calls };
}

const createDto = (over: Record<string, unknown> = {}) =>
  ({ code: "tasks-50", name: "Chăm chỉ", description: "", rarity: "COMMON", order: 0, criteria, reason: "Thêm huy hiệu mới cho quý", ...over }) as never;
const patchDto = (over: Record<string, unknown> = {}) => ({ expectedVersion: 1, reason: "Đổi ảnh huy hiệu cho khớp", ...over }) as never;

describe("BadgeAdminService.create — ảnh huy hiệu", () => {
  it("có iconAssetId: kiểm asset TRƯỚC, rồi tạo + gắn link trong MỘT transaction, link trỏ đúng huy hiệu vừa tạo", async () => {
    const { service, icons, run, calls } = setup(null);
    const dto = await service.create(actor, createDto({ iconAssetId: "a1" }));
    expect(icons.assertUsable).toHaveBeenCalledWith("a1", "admin1");
    expect(run).toHaveBeenCalledTimes(1);
    expect(icons.attach).toHaveBeenCalledWith(TX, { badgeId: "new1", assetId: "a1", actorId: "admin1" });
    expect(calls).toEqual(["create:tx", "attach"]);
    expect(dto.iconAssetId).toBe("a1");
  });

  it("không có ảnh: tạo trực tiếp, không transaction, không đụng asset", async () => {
    const { service, icons, run, calls } = setup(null);
    await service.create(actor, createDto());
    expect(run).not.toHaveBeenCalled();
    expect(icons.assertUsable).not.toHaveBeenCalled();
    expect(icons.attach).not.toHaveBeenCalled();
    expect(calls).toEqual(["create:direct"]);
  });

  it("asset không dùng được → lỗi của cổng, KHÔNG tạo huy hiệu", async () => {
    const { service, icons, badges } = setup(null);
    icons.assertUsable.mockRejectedValueOnce(new NotFoundError("Không tìm thấy ảnh huy hiệu"));
    await expect(service.create(actor, createDto({ iconAssetId: "a1" }))).rejects.toBeInstanceOf(NotFoundError);
    expect(badges.create).not.toHaveBeenCalled();
  });

  it("trùng mã trong transaction → GAME_003 (409), không gắn link", async () => {
    const { service, icons, badges } = setup(null);
    badges.create.mockRejectedValueOnce(new UniqueViolationError("Badge.code"));
    await expect(service.create(actor, createDto({ iconAssetId: "a1" }))).rejects.toMatchObject({ statusCode: 409, errorCode: "GAME_003" });
    expect(icons.attach).not.toHaveBeenCalled();
  });
});

describe("BadgeAdminService.patch — ảnh huy hiệu", () => {
  it("đổi ảnh: kiểm ảnh mới, CAS + gỡ link cũ + gắn link mới trong một transaction", async () => {
    const { service, icons, run, calls, audit } = setup(badge({ iconAssetId: "old" }));
    const dto = await service.patch(actor, "b1", patchDto({ iconAssetId: "new" }));
    expect(icons.assertUsable).toHaveBeenCalledWith("new", "admin1");
    expect(run).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["update:tx", "detach", "attach"]);
    expect(icons.detach).toHaveBeenCalledWith(TX, { badgeId: "b1", assetId: "old" });
    expect(icons.attach).toHaveBeenCalledWith(TX, { badgeId: "b1", assetId: "new", actorId: "admin1" });
    expect(dto.iconAssetId).toBe("new");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ before: expect.objectContaining({ iconAssetId: "old" }), after: expect.objectContaining({ iconAssetId: "new" }) }) }));
  });

  it("iconAssetId = null: chỉ gỡ link cũ, không kiểm/gắn gì", async () => {
    const { service, icons } = setup(badge({ iconAssetId: "old" }));
    const dto = await service.patch(actor, "b1", patchDto({ iconAssetId: null }));
    expect(icons.assertUsable).not.toHaveBeenCalled();
    expect(icons.detach).toHaveBeenCalledWith(TX, { badgeId: "b1", assetId: "old" });
    expect(icons.attach).not.toHaveBeenCalled();
    expect(dto.iconAssetId).toBeNull();
  });

  it("huy hiệu chưa có ảnh + gắn ảnh mới: chỉ attach (không detach)", async () => {
    const { service, icons } = setup(badge({ iconAssetId: null }));
    await service.patch(actor, "b1", patchDto({ iconAssetId: "new" }));
    expect(icons.detach).not.toHaveBeenCalled();
    expect(icons.attach).toHaveBeenCalledTimes(1);
  });

  it("gửi lại đúng ảnh đang dùng, hoặc không gửi trường ảnh: không transaction, không kiểm lại", async () => {
    for (const over of [{ iconAssetId: "same", name: "Tên mới" }, { name: "Tên mới" }]) {
      const { service, icons, run, calls } = setup(badge({ iconAssetId: "same" }));
      await service.patch(actor, "b1", patchDto(over));
      expect(run).not.toHaveBeenCalled();
      expect(icons.assertUsable).not.toHaveBeenCalled();
      expect(calls).toEqual(["update:direct"]);
    }
  });

  it("lệch phiên bản khi đổi ảnh → VersionConflictError, KHÔNG gỡ/gắn link nào", async () => {
    const { service, icons } = setup(badge({ iconAssetId: "old" }));
    await expect(service.patch(actor, "b1", patchDto({ iconAssetId: "new", expectedVersion: 9 }))).rejects.toBeInstanceOf(VersionConflictError);
    expect(icons.detach).not.toHaveBeenCalled();
    expect(icons.attach).not.toHaveBeenCalled();
  });

  it("ảnh mới không dùng được → lỗi, chưa ghi gì", async () => {
    const { service, icons, badges } = setup(badge({ iconAssetId: "old" }));
    icons.assertUsable.mockRejectedValueOnce(new ForbiddenError("x"));
    await expect(service.patch(actor, "b1", patchDto({ iconAssetId: "new" }))).rejects.toBeInstanceOf(ForbiddenError);
    expect(badges.updateIf).not.toHaveBeenCalled();
  });
});

describe("registerGamificationIntegrations — gate BADGE + resolver BADGE_ICON", () => {
  const roles = new Map<string, string | null>([
    ["admin", "admin"],
    ["manager", "manager"],
    ["user", "user"],
    ["ghost", null],
  ]);
  const directory = { getRole: (id: string) => Promise.resolve(roles.get(id) ?? null) } as unknown as IGamDirectory;
  beforeEach(() => {
    clearAssetScopeGates();
    clearAssetTargetReadResolvers();
    // Tạo mock TRONG beforeEach: cấu hình jest có thể reset implementation của mock cấp module giữa các ca.
    const findById = jest.fn((id: string) => Promise.resolve(id === "b1" ? badge() : null));
    registerGamificationIntegrations({ badges: { findById } as unknown as IBadgeRepository, directory });
  });

  const gateInput = (ownerId: string) => ({ ownerId, fileName: "a.png", mime: "image/png", size: 100 });

  it("chỉ admin/manager (gamification:update) xin được URL upload scope BADGE; user thường hoặc không tồn tại → 403", async () => {
    const gate = getAssetScopeGate("BADGE");
    await expect(gate?.beforeCreate(gateInput("admin"))).resolves.toBeUndefined();
    await expect(gate?.beforeCreate(gateInput("manager"))).resolves.toBeUndefined();
    await expect(gate?.beforeCreate(gateInput("user"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(gate?.beforeCreate(gateInput("ghost"))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ảnh huy hiệu đọc được bởi MỌI người đăng nhập khi huy hiệu còn tồn tại; huy hiệu không còn → không đọc được", async () => {
    const resolver = getAssetTargetReadResolver("BADGE_ICON");
    const link = (targetId: string) => ({ assetId: "a1", targetType: "BADGE_ICON", targetId, scopeType: "NONE", scopeId: null });
    await expect(resolver?.canRead({ id: "stranger", email: "s@x.vn" }, link("b1"))).resolves.toBe(true);
    await expect(resolver?.canRead({ id: "stranger", email: "s@x.vn" }, link("gone"))).resolves.toBe(false);
  });
});

describe("mimePolicy — scope BADGE siết chặt (PNG/WebP ≤ 512 KiB, không SVG)", () => {
  const KiB = 1024;
  it("nhận PNG/WebP đến đúng 512 KiB; JPEG/GIF/SVG/HEIC bị 415 ASSET_001", () => {
    for (const mime of ["image/png", "image/webp"]) {
      expect(mimePolicy.resolve({ kind: "IMAGE", mime, size: 512 * KiB, scope: "BADGE" }).maxBytes).toBe(512 * KiB);
    }
    for (const mime of ["image/jpeg", "image/gif", "image/svg+xml", "image/heic"]) {
      expect(() => mimePolicy.resolve({ kind: "IMAGE", mime, size: 10, scope: "BADGE" })).toThrow(expect.objectContaining({ statusCode: 415, errorCode: "ASSET_001" }));
    }
  });

  it("vượt 512 KiB → 413 ASSET_002; kind khác IMAGE bị từ chối", () => {
    expect(() => mimePolicy.resolve({ kind: "IMAGE", mime: "image/png", size: 512 * KiB + 1, scope: "BADGE" })).toThrow(expect.objectContaining({ statusCode: 413, errorCode: "ASSET_002" }));
    expect(() => mimePolicy.resolve({ kind: "FILE", mime: "application/pdf", size: 10, scope: "BADGE" })).toThrow(expect.objectContaining({ errorCode: "ASSET_001" }));
    expect(mimePolicy.allowedMimes("IMAGE", "BADGE")).toEqual(["image/png", "image/webp"]);
  });
});
