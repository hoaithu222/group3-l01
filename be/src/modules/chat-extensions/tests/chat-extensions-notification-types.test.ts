/**
 * Unit — loại thông báo của p7-04 (be.md §7): `scheduled-message.failed` (inbox, push `default`) và `message.reminder` (inbox, `respectMute: NEVER` — nhắc do CHÍNH người dùng đặt); push trung tính,
 * KHÔNG kèm nội dung tin/tên kênh; `NotifyChatNotifier` ghi `notify()` đúng tham số (scope null, dedupeKey theo thực thể, refs không chứa nội dung, tin không khả dụng không mang messageId).
 */
const mockNotify = jest.fn();
jest.mock("../../notifications/public", () => {
  const actual = jest.requireActual("../../notifications/public");
  return { ...actual, notify: (...args: unknown[]) => mockNotify(...args) };
});

import { getNotificationType } from "../../notifications/public";
import { NotifyChatNotifier } from "../services/chat-extensions-adapters";
import { CHAT_EXT_NOTIFICATION_TYPES, registerChatExtensionsNotificationTypes } from "../services/chat-extensions-notification-types";
import type { TxHandle } from "../repositories/tx";

const tx = {} as unknown as TxHandle;

describe("registerChatExtensionsNotificationTypes", () => {
  beforeEach(() => registerChatExtensionsNotificationTypes());

  it("scheduled-message.failed: hộp thư + push mặc định, đích danh; nội dung push không chứa nội dung tin/tên kênh", () => {
    const def = getNotificationType(CHAT_EXT_NOTIFICATION_TYPES.SCHEDULED_FAILED);
    expect(def).toMatchObject({ inbox: true, inboxFilter: "all", androidChannel: "default", batchable: false, personal: true, readAction: null });
    // Ngay cả khi người dùng bật xem trước màn hình khoá, nội dung push vẫn trung tính (không kèm nội dung tin/tên kênh).
    for (const lockScreenPreview of [false, true]) {
      const push = def?.push?.template?.({ refs: { scheduledMessageId: "x", reason: "NO_PERMISSION" }, lockScreenPreview });
      expect(push?.title).toBeTruthy();
      expect(JSON.stringify(push)).not.toMatch(/kênh/i);
    }
    expect(def?.push?.collapseKey?.({ scheduledMessageId: "abc" })).toBe("scheduled-message.failed:abc");
  });

  it("message.reminder: respectMute NEVER (nhắc do chính người dùng đặt vẫn tới dù tắt tiếng), không lọc theo 'chỉ nhắc tên'; push chung 'Bạn có một lời nhắc tin nhắn'", () => {
    const def = getNotificationType(CHAT_EXT_NOTIFICATION_TYPES.MESSAGE_REMINDER);
    expect(def).toMatchObject({ inbox: true, respectMute: "NEVER", personal: true, readAction: null });
    for (const lockScreenPreview of [false, true]) {
      expect(def?.push?.template?.({ refs: { reminderId: "r", unavailable: true }, lockScreenPreview })).toEqual({ title: "Nhắc lại tin nhắn", body: "Bạn có một lời nhắc tin nhắn." });
    }
    expect(def?.push?.dataKeys).toEqual(expect.arrayContaining(["reminderId"]));
  });
});

describe("NotifyChatNotifier", () => {
  const notifier = new NotifyChatNotifier();
  beforeEach(() => mockNotify.mockResolvedValue({}));

  it("scheduledFailed: notify tới tác giả, scope null, nguồn ScheduledMessage, dedupeKey theo id, refs chỉ id + lý do", async () => {
    await notifier.scheduledFailed(tx, { scheduledMessageId: "s1", authorId: "u1", reason: "NO_PERMISSION" });
    expect(mockNotify).toHaveBeenCalledWith(tx, {
      type: "scheduled-message.failed",
      scope: null,
      source: { type: "ScheduledMessage", id: "s1" },
      refs: { scheduledMessageId: "s1", reason: "NO_PERMISSION" },
      recipients: [{ userId: "u1" }],
      dedupeKey: "scheduled-message.failed:s1",
    });
  });

  it("reminder: tin còn khả dụng mang messageId + phạm vi; KHÔNG khả dụng chỉ mang reminderId + unavailable (REMIND-01)", async () => {
    await notifier.reminder(tx, { reminderId: "r1", userId: "u1", messageId: "m1", scopeType: "CHANNEL", scopeId: "c1", unavailable: false });
    expect(mockNotify.mock.calls[0]?.[1]).toMatchObject({ type: "message.reminder", scope: null, dedupeKey: "message-reminder:r1", refs: { reminderId: "r1", messageId: "m1", scopeType: "CHANNEL", scopeId: "c1" } });
    await notifier.reminder(tx, { reminderId: "r2", userId: "u1", messageId: "m1", scopeType: "CHANNEL", scopeId: "c1", unavailable: true });
    const refs = mockNotify.mock.calls[1]?.[1].refs as Record<string, unknown>;
    expect(refs).toEqual({ reminderId: "r2", unavailable: true });
  });
});
