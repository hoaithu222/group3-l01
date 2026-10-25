import { InMemoryWorkspaceStorageRepository } from "../repositories/workspace-storage.repository";
import { InMemoryTxRunner } from "../repositories/tx";
import { InMemoryReservationStore, StorageQuotaService } from "../services/storage-quota.service";
import { ResourceUploadGate } from "../services/resource-upload.gate";
import { FakeAccess, GUEST, MEMBER, WS } from "./support/harness";

describe("StorageQuotaService", () => {
  const overrides: Array<{ workspaceId: string; bytes: number }> = [];
  let quotaBytes = 1000;
  let retentionDays = 30;
  const config = {
    getEffective: (key: string) =>
      Promise.resolve(key === "resource" ? { quotaOverrides: overrides } : { workspaceQuotaBytes: quotaBytes, trashRetentionDays: retentionDays }),
  };
  let usage: InMemoryWorkspaceStorageRepository;
  let reservations: InMemoryReservationStore;
  let quota: StorageQuotaService;
  const tx = new InMemoryTxRunner();

  beforeEach(() => {
    overrides.length = 0;
    quotaBytes = 1000;
    retentionDays = 30;
    usage = new InMemoryWorkspaceStorageRepository();
    usage.used.set(WS, 0);
    reservations = new InMemoryReservationStore();
    quota = new StorageQuotaService(usage, reservations, config);
  });

  it("hạn mức = override riêng của nhóm, không có thì mặc định toàn cục; thùng rác theo cấu hình", async () => {
    expect(await quota.quotaFor(WS)).toEqual({ quotaBytes: 1000, source: "DEFAULT" });
    overrides.push({ workspaceId: "other", bytes: 5 }, { workspaceId: WS, bytes: 4000 });
    expect(await quota.quotaFor(WS)).toEqual({ quotaBytes: 4000, source: "OVERRIDE" });
    retentionDays = 45;
    expect(await quota.retentionDays()).toBe(45);
  });

  it("giữ chỗ + chuyển dùng: đã dùng + đang giữ + size > hạn mức → RSC_007; release trả chỗ", async () => {
    usage.used.set(WS, 400);
    await quota.assertCanReserve(WS, 600); // vừa khít
    await quota.reserve(WS, "a1", 300);
    await expect(quota.assertCanReserve(WS, 400)).rejects.toMatchObject({ statusCode: 413, errorCode: "RSC_007" });
    await quota.assertCanReserve(WS, 300);
    await quota.release(WS, "a1");
    await quota.assertCanReserve(WS, 600);
    expect(await reservations.reservedBytes(WS)).toBe(0);
  });

  it("kiểm CỨNG trong transaction: vượt → RSC_007 (chi tiết quota/used); đủ → $inc", async () => {
    usage.used.set(WS, 900);
    await tx.run((t) => expect(quota.consumeInTx(t, WS, 200)).rejects.toMatchObject({ errorCode: "RSC_007", details: { quotaBytes: 1000, usedBytes: 900 } }));
    await tx.run((t) => quota.consumeInTx(t, WS, 100));
    expect(usage.used.get(WS)).toBe(1000);
    await tx.run((t) => quota.refundInTx(t, WS, 400));
    expect(usage.used.get(WS)).toBe(600);
  });

  it("workspace không tồn tại khi tạo → RSC_003 (không nhận dung lượng)", async () => {
    await tx.run((t) => expect(quota.consumeInTx(t, "cccccccccccccccccccccccc", 1)).rejects.toMatchObject({ errorCode: "RSC_003" }));
  });

  it("Redis (giữ chỗ) lỗi → fail-open: vẫn kiểm theo số đã dùng", async () => {
    const broken = { reserve: jest.fn(), release: jest.fn(), reservedBytes: jest.fn().mockRejectedValue(new Error("redis down")) };
    const q = new StorageQuotaService(usage, broken, config);
    usage.used.set(WS, 999);
    await expect(q.assertCanReserve(WS, 1)).resolves.toBeUndefined();
    await expect(q.assertCanReserve(WS, 2)).rejects.toMatchObject({ errorCode: "RSC_007" });
  });
});

describe("ResourceUploadGate (hook POST /assets scope RESOURCE)", () => {
  it("bắt buộc workspaceId; quyền upload (GUEST → 404); hạn mức; afterCreate giữ chỗ, release trả chỗ", async () => {
    const usage = new InMemoryWorkspaceStorageRepository();
    usage.used.set(WS, 0);
    const reservations = new InMemoryReservationStore();
    const gate = new ResourceUploadGate(
      new FakeAccess(),
      new StorageQuotaService(usage, reservations, { getEffective: (k) => Promise.resolve(k === "resource" ? {} : { workspaceQuotaBytes: 1000 }) })
    );
    const base = { ownerId: MEMBER.id, fileName: "a.pdf", mime: "application/pdf", size: 600 };

    await expect(gate.beforeCreate(base)).rejects.toMatchObject({ statusCode: 400 });
    await expect(gate.beforeCreate({ ...base, ownerId: GUEST.id, workspaceId: WS })).rejects.toMatchObject({ statusCode: 404 });
    await expect(gate.beforeCreate({ ...base, size: 1001, workspaceId: WS })).rejects.toMatchObject({ statusCode: 413, errorCode: "RSC_007" });

    await gate.beforeCreate({ ...base, workspaceId: WS });
    await gate.afterCreate({ assetId: "a1", workspaceId: WS, size: 600 });
    await expect(gate.beforeCreate({ ...base, workspaceId: WS })).rejects.toMatchObject({ errorCode: "RSC_007" });
    await gate.release({ assetId: "a1", workspaceId: WS });
    await expect(gate.beforeCreate({ ...base, workspaceId: WS })).resolves.toBeUndefined();
  });
});
