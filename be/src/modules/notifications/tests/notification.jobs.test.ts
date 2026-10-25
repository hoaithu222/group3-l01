import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;

const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
}));

const mockDeliverRecipient = jest.fn().mockResolvedValue(undefined);
jest.mock("../services/notification-wiring", () => ({
  getDeliveryPolicy: () => ({ deliverRecipient: (...args: unknown[]) => mockDeliverRecipient(...args) }),
}));

import "../jobs/notification.jobs";

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

describe("notification.jobs", () => {
  it("đăng ký job deliver.recipient trên queue notifications", () => {
    expect(mockRegistered).toContainEqual(["notifications", "deliver.recipient", expect.any(Function)]);
  });

  it("gọi DeliveryPolicy.deliverRecipient với đúng notificationId/recipientId", async () => {
    mockDeliverRecipient.mockResolvedValue(undefined);
    const processor = getProcessor("notifications", "deliver.recipient");
    await processor({ data: { notificationId: "n1", recipientId: "u1" } } as Job);
    expect(mockDeliverRecipient).toHaveBeenCalledWith("n1", "u1");
  });
});
