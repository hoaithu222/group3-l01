/**
 * Unit — `ChatExtensionsUserDataService` (p7-04 be.md §7 `user.anonymized`): ẩn danh hoá tài khoản → huỷ tin hẹn giờ PENDING (xoá nội dung/tệp, gỡ AssetLink), huỷ nhắc PENDING, xoá phiếu bầu
 * nhưng GIỮ số đếm trên khảo sát; không đụng dữ liệu của người khác; chạy lại không còn gì để làm.
 */
import { CH, ChatExtHarness, MINUTE, pollDto } from "./support/chat-extensions-harness";

let h: ChatExtHarness;
beforeEach(() => {
  h = new ChatExtHarness();
});

it("huỷ tin hẹn/nhắc đang chờ của người đó, xoá phiếu (giữ đếm), không ảnh hưởng người khác; idempotent", async () => {
  const alice = h.addUser();
  const bob = h.addUser();
  const m = h.sender.seedMessage({ authorId: bob.id });

  const mine = await h.scheduledService.create(alice, "CHANNEL", CH, { content: "Riêng tư của Alice", mentions: [], attachmentAssetIds: ["aa".repeat(12)], sendAt: h.after(2 * MINUTE), timezone: "UTC" });
  const bobs = await h.scheduledService.create(bob, "CHANNEL", CH, { content: "Của Bob", mentions: [], attachmentAssetIds: [], sendAt: h.after(2 * MINUTE), timezone: "UTC" });
  await h.reminderService.create(alice, m.id, { remindAt: h.after(2 * MINUTE), timezone: "UTC" });
  const bobReminder = await h.reminderService.create(bob, m.id, { remindAt: h.after(2 * MINUTE), timezone: "UTC" });
  const poll = await h.pollService.create(bob, "CHANNEL", CH, pollDto({ anonymous: false }));
  await h.pollService.vote(alice, poll.poll.id, [poll.poll.options[0]?.id as string]);
  await h.pollService.vote(bob, poll.poll.id, [poll.poll.options[1]?.id as string]);

  const first = await h.userData.onUserAnonymized(alice.id);
  expect(first).toEqual({ scheduledCancelled: 1, remindersCancelled: 1, votesDeleted: 1 });

  expect(await h.scheduled.findById(mine.id)).toMatchObject({ status: "CANCELLED", content: null, attachmentAssetIds: [], mentions: [] });
  expect(h.assets.detached).toContainEqual({ scheduledMessageId: mine.id });
  expect((await h.scheduled.findById(bobs.id))?.status).toBe("PENDING");
  expect((await h.reminderRepo.findById(bobReminder.id))?.status).toBe("PENDING");
  // Số đếm của khảo sát giữ nguyên (kết quả cuộc khảo sát không đổi); phiếu của Alice không còn.
  expect(await h.votes.find(poll.poll.id, alice.id)).toBeNull();
  expect(await h.votes.find(poll.poll.id, bob.id)).not.toBeNull();
  expect((await h.polls.findById(poll.poll.id))?.voterCount).toBe(2);

  expect(await h.userData.onUserAnonymized(alice.id)).toEqual({ scheduledCancelled: 0, remindersCancelled: 0, votesDeleted: 0 });
});
