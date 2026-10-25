/**
 * `notify()` (p1-07) — điểm mở rộng cho module khác (p3-03, p3-04…): IDEMPOTENT (gọi lại không tạo dòng outbox
 * `deliver.recipient` trùng khoá → không P2002 huỷ transaction của caller), `stream` cho mark-read-by-stream (NT-12),
 * `respectBlock` (BLOCK-03: người đã chặn người gây ra không nhận), tự loại `actorId`.
 */
const mockOutboxAdd = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../infrastructure/queue", () => ({ outbox: { add: (...args: unknown[]) => mockOutboxAdd(...args) } }));

import { notify } from "../services/notify";
import { clearNotificationTypeRegistry, registerBuiltinNotificationTypes, registerNotificationType } from "../services/notification-types";
import { setNotificationBlockFilter } from "../services/block-filter.holder";
import type { NotificationTypeDef } from "../entities/notification.interface";

interface RecipientRow {
  id: string;
  notificationId: string;
  recipientId: string;
  dedupeKey: string;
  kind: string;
  [k: string]: unknown;
}

/** `tx` giả tối thiểu — đủ cho `notify()`: 3 collection, khoá unique `(recipientId, dedupeKey)` và `dedupeKey` của Notification. */
function makeTx() {
  const notifications = new Map<string, { id: string; dedupeKey: string }>();
  const recipients: RecipientRow[] = [];
  let seq = 0;
  const tx = {
    notification: {
      upsert: jest.fn(async ({ where, create }: { where: { dedupeKey: string }; create: { dedupeKey: string } }) => {
        const existing = notifications.get(where.dedupeKey);
        if (existing) return existing;
        const row = { id: `n${++seq}`, ...create };
        notifications.set(where.dedupeKey, row);
        return row;
      }),
    },
    notificationRecipient: {
      findUnique: jest.fn(async ({ where }: { where: { recipientId_dedupeKey: { recipientId: string; dedupeKey: string } } }) => {
        const k = where.recipientId_dedupeKey;
        return recipients.find((r) => r.recipientId === k.recipientId && r.dedupeKey === k.dedupeKey) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Omit<RecipientRow, "id"> }) => {
        const row = { id: `r${++seq}`, ...data } as RecipientRow;
        recipients.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<RecipientRow> }) => {
        const row = recipients.find((r) => r.id === where.id) as RecipientRow;
        Object.assign(row, data);
        return row;
      }),
    },
  };
  return { tx: tx as never, recipients, notifications };
}

const TYPE = "test.ext-comment";
const def = (over: Partial<NotificationTypeDef> = {}): NotificationTypeDef => ({
  type: TYPE,
  inbox: true,
  inboxFilter: "mentions",
  pushType: TYPE,
  androidChannel: "mentions",
  priority: 10,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: null,
  ...over,
});

const A = "64b0000000000000000000a1"; // người gây ra (actor)
const B = "64b0000000000000000000b2";
const C = "64b0000000000000000000c3";
const D = "64b0000000000000000000d4";

const base = (over: Record<string, unknown> = {}) => ({
  type: TYPE,
  actorId: A,
  scope: { type: "CHANNEL" as const, id: "64b0000000000000000000e5" },
  workspaceId: "64b0000000000000000000f6",
  source: { type: "Comment", id: "comment:1" },
  refs: { commentId: "1" },
  dedupeKey: "ext:comment:1",
  recipients: [{ userId: B }, { userId: C }],
  ...over,
});

describe("notify() — p1-07", () => {
  beforeEach(() => {
    mockOutboxAdd.mockClear();
    clearNotificationTypeRegistry();
    registerBuiltinNotificationTypes();
    registerNotificationType(def());
    setNotificationBlockFilter(null);
  });
  afterAll(() => setNotificationBlockFilter(null));

  it("người nhận mới: 1 mục + 1 dòng outbox deliver.recipient/người; tác giả (actor) bị loại", async () => {
    const { tx, recipients } = makeTx();
    await notify(tx, base({ recipients: [{ userId: A }, { userId: B }, { userId: C }] }));
    expect(recipients.map((r) => r.recipientId).sort()).toEqual([B, C]);
    expect(mockOutboxAdd).toHaveBeenCalledTimes(2);
    expect(mockOutboxAdd.mock.calls.map((c) => (c[1] as { dedupeKey: string }).dedupeKey)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^deliver:n\d+:64b0000000000000000000b2$/)])
    );
  });

  it("IDEMPOTENT: gọi lại cùng dedupeKey + cùng người nhận → không ghi thêm outbox, không nhân đôi mục (không P2002)", async () => {
    const { tx, recipients } = makeTx();
    await notify(tx, base());
    mockOutboxAdd.mockClear();
    await notify(tx, base());
    expect(recipients).toHaveLength(2);
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });

  it("gọi lại với danh sách mở rộng: chỉ người MỚI được xếp giao", async () => {
    const { tx, recipients } = makeTx();
    await notify(tx, base({ recipients: [{ userId: B }] }));
    mockOutboxAdd.mockClear();
    await notify(tx, base({ recipients: [{ userId: B }, { userId: D }] }));
    expect(recipients.map((r) => r.recipientId).sort()).toEqual([B, D].sort());
    expect(mockOutboxAdd).toHaveBeenCalledTimes(1);
    expect((mockOutboxAdd.mock.calls[0]?.[1] as { payload: { recipientId: string } }).payload.recipientId).toBe(D);
  });

  it("nâng kind theo ưu tiên trên cùng khoá nguồn (MENTION_ROLE 90 → MENTION 100), không xếp giao lần 2", async () => {
    const { tx, recipients } = makeTx();
    await notify(tx, base({ recipients: [{ userId: B, kind: "MENTION_ROLE" }] }));
    mockOutboxAdd.mockClear();
    await notify(tx, base({ dedupeKey: "ext:comment:1:b", recipients: [{ userId: B, kind: "MENTION" }] }));
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toMatchObject({ kind: "MENTION", kindRank: 100 });
    expect(mockOutboxAdd).not.toHaveBeenCalled();
    // hạ kind KHÔNG được phép
    await notify(tx, base({ dedupeKey: "ext:comment:1:c", recipients: [{ userId: B, kind: "THREAD_REPLY" }] }));
    expect(recipients[0]?.kind).toBe("MENTION");
  });

  it("stream {key, seq} ghi vào hàng người nhận (NT-12: đọc tới tin thì mục tự thành đã đọc); vắng → null tường minh", async () => {
    const { tx, recipients } = makeTx();
    await notify(tx, base({ recipients: [{ userId: B }], stream: { key: "root", seq: 42 } }));
    expect(recipients[0]).toMatchObject({ streamKey: "root", streamSeq: 42 });

    const other = makeTx();
    await notify(other.tx, base({ recipients: [{ userId: B }] }));
    expect(other.recipients[0]).toMatchObject({ streamKey: null, streamSeq: null, readAt: null, cancelledAt: null });
  });

  it("respectBlock=true + actorId: người đã chặn actor KHÔNG có mục, KHÔNG có outbox (BLOCK-03)", async () => {
    registerNotificationType(def({ respectBlock: true }));
    const filter = jest.fn(async (_actor: string, ids: string[]) => ids.filter((id) => id !== C)); // C đã chặn A
    setNotificationBlockFilter({ filterNotificationRecipients: filter });
    const { tx, recipients } = makeTx();
    await notify(tx, base());
    expect(filter).toHaveBeenCalledWith(A, [B, C]);
    expect(recipients.map((r) => r.recipientId)).toEqual([B]);
    expect(mockOutboxAdd).toHaveBeenCalledTimes(1);
  });

  it("respectBlock mặc định (tắt): không gọi BlockPort — giữ hành vi các loại có sẵn", async () => {
    const filter = jest.fn(async (_actor: string, ids: string[]) => ids);
    setNotificationBlockFilter({ filterNotificationRecipients: filter });
    const { tx, recipients } = makeTx();
    await notify(tx, base());
    expect(filter).not.toHaveBeenCalled();
    expect(recipients).toHaveLength(2);
  });

  it("respectBlock nhưng không có actorId (thông báo hệ thống) → không lọc", async () => {
    registerNotificationType(def({ respectBlock: true }));
    const filter = jest.fn(async (_actor: string, ids: string[]) => ids);
    setNotificationBlockFilter({ filterNotificationRecipients: filter });
    const { tx, recipients } = makeTx();
    await notify(tx, base({ actorId: undefined }));
    expect(filter).not.toHaveBeenCalled();
    expect(recipients).toHaveLength(2);
  });

  it("loại chưa đăng ký → lỗi rõ ràng (chống gõ nhầm type)", async () => {
    const { tx } = makeTx();
    await expect(notify(tx, base({ type: "khong.ton.tai" }))).rejects.toThrow(/chưa đăng ký/);
  });
});
