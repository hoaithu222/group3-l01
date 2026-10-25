/**
 * Mongo thật (`TEST_DB=memory`) — script `db:backfill-grant-subject-key` (p3-04): doc `ChannelGrant` Phase 1 thiếu `subjectKey`
 * được điền (`userId` cho DIRECT, `role:<roleRef>` cho ROLE); idempotent (chạy lần 2 không đổi gì); có dry-run (chỉ đếm, không ghi);
 * doc không suy được KHÔNG bị sửa và được báo `invalid`. Ghi/đọc doc cũ bằng lệnh Mongo thô vì client có kiểu coi `subjectKey`
 * là bắt buộc. Chỉ chạy trên Mongo in-memory — KHÔNG bao giờ trỏ vào Atlas.
 */
import { prisma } from "../../src/infrastructure/database";
import { newObjectId } from "../../src/core/utils/object-id";
import { backfillChannelGrantSubjectKey } from "../backfill-channel-grant-subject-key";

const oid = (id: string) => ({ $oid: id });

describe("backfill-channel-grant-subject-key (Mongo memory replset)", () => {
  const workspaceId = newObjectId();
  const channelId = newObjectId();
  const [u1, u2, u3, u4] = [newObjectId(), newObjectId(), newObjectId(), newObjectId()];
  const doc = (extra: Record<string, unknown>) => ({
    channelId: oid(channelId),
    workspaceId: oid(workspaceId),
    level: "MEMBER",
    grantedBy: oid(u1),
    createdAt: { $date: new Date().toISOString() },
    ...extra,
  });

  const rawFind = async (filter: Record<string, unknown>): Promise<Array<Record<string, unknown>>> => {
    const res = (await prisma.$runCommandRaw({ find: "ChannelGrant", filter: { workspaceId: oid(workspaceId), ...filter } })) as {
      cursor: { firstBatch: Array<Record<string, unknown>> };
    };
    return res.cursor.firstBatch;
  };

  beforeEach(async () => {
    await prisma.$runCommandRaw({
      insert: "ChannelGrant",
      documents: [
        doc({ userId: oid(u1), source: "DIRECT" }), // thiếu subjectKey (vắng)
        doc({ userId: oid(u2), source: "DIRECT", subjectKey: null }), // subjectKey null tường minh
        doc({ source: "ROLE", roleRef: "ADMIN", userId: null }), // role grant thiếu subjectKey
        doc({ userId: oid(u3), source: "DIRECT", subjectKey: u3 }), // ĐÃ có — không được đổi
        doc({ source: "DIRECT" }), // không userId → không suy được
        doc({ source: "ROLE", roleRef: null }), // ROLE nhưng thiếu roleRef → không suy được
      ],
    });
  });

  afterEach(async () => {
    await prisma.$runCommandRaw({ delete: "ChannelGrant", deletes: [{ q: { workspaceId: oid(workspaceId) }, limit: 0 }] });
  });

  it("dry-run: chỉ đếm (6 grant, 5 thiếu subjectKey, 2 không suy được), KHÔNG ghi gì", async () => {
    const result = await backfillChannelGrantSubjectKey(prisma, { dryRun: true });
    // Collection có thể còn doc của test khác trong cùng DB → chỉ so sánh phần của workspace này qua kết quả ghi thật bên dưới.
    expect(result.dryRun).toBe(true);
    expect(result.updated).toBe(0);
    expect(result.missing).toBeGreaterThanOrEqual(5);
    expect(await rawFind({ subjectKey: { $exists: true, $ne: null } })).toHaveLength(1); // chỉ doc u3 vốn có sẵn
  });

  it("điền subjectKey: DIRECT = userId, ROLE = role:<roleRef>; doc đã có giữ nguyên; doc không suy được KHÔNG bị sửa", async () => {
    const result = await backfillChannelGrantSubjectKey(prisma);
    expect(result.dryRun).toBe(false);
    expect(result.updated).toBe(3);
    expect(result.invalid).toBeGreaterThanOrEqual(2);

    const filled = await rawFind({ subjectKey: { $ne: null } });
    const keys = filled.map((d) => d.subjectKey).sort();
    expect(keys).toEqual([u1, u2, u3, "role:ADMIN"].sort());
    // Doc không suy được vẫn thiếu subjectKey.
    expect(await rawFind({ subjectKey: null })).toHaveLength(2);

    // Sau backfill Prisma có kiểu đọc được doc hợp lệ bằng khoá unique mới.
    const viaPrisma = await prisma.channelGrant.findUnique({
      where: { channelId_subjectKey_source: { channelId, subjectKey: u1, source: "DIRECT" } },
    });
    expect(viaPrisma).toMatchObject({ userId: u1, subjectKey: u1, source: "DIRECT" });
    const roleGrant = await prisma.channelGrant.findUnique({
      where: { channelId_subjectKey_source: { channelId, subjectKey: "role:ADMIN", source: "ROLE" } },
    });
    expect(roleGrant).toMatchObject({ userId: null, roleRef: "ADMIN" });
  });

  it("idempotent: chạy lần 2 không đổi dữ liệu (updated = 0, giá trị subjectKey giữ nguyên)", async () => {
    await backfillChannelGrantSubjectKey(prisma);
    const before = JSON.stringify(await rawFind({ subjectKey: { $ne: null } }));

    const second = await backfillChannelGrantSubjectKey(prisma);
    expect(second.updated).toBe(0);
    expect(JSON.stringify(await rawFind({ subjectKey: { $ne: null } }))).toBe(before);
  });
});
