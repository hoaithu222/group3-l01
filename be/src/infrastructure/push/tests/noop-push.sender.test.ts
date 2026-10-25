import { NoopPushSender } from "../noop-push.sender";
import type { PushPayload } from "../push.types";

describe("NoopPushSender", () => {
  const payload: PushPayload = {
    type: "mention",
    targetUserId: "u1",
    sentAt: new Date().toISOString(),
    data: {},
  };

  it("trả successCount 0, không throw, không có token chết", async () => {
    const sender = new NoopPushSender();
    const result = await sender.sendMulticast(["token-a", "token-b"], payload);
    expect(result).toEqual({ successCount: 0, invalidTokens: [] });
  });

  it("tokens rỗng vẫn trả kết quả hợp lệ", async () => {
    const sender = new NoopPushSender();
    await expect(sender.sendMulticast([], payload)).resolves.toEqual({
      successCount: 0,
      invalidTokens: [],
    });
  });
});
