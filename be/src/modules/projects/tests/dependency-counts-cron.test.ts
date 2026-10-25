/**
 * `dependency-counts.rebuild` PHẢI là cron TĨNH (`defineCron`): `syncCronSchedulers()` xoá mọi scheduler không có trong registry tĩnh
 * (bài học p3-04 — scheduler theo-thực-thể bị dọn), nên ở đây kiểm nó được upsert đúng lịch/múi giờ và không bị dọn.
 */
const upsertJobScheduler = jest.fn();
const removeJobScheduler = jest.fn();
const existing: { key: string }[] = [];

jest.mock("../../../infrastructure/queue/queues", () => ({
  ...jest.requireActual("../../../infrastructure/queue/queues"),
  getQueue: jest.fn(),
}));

import { syncCronSchedulers } from "../../../infrastructure/queue/cron.registry";
import { getQueue } from "../../../infrastructure/queue/queues";

describe("cron TĨNH dependency-counts.rebuild (p4-04 be.md §7)", () => {
  beforeAll(async () => {
    await import("../jobs/dependency-counts-rebuild.job");
  });

  beforeEach(() => {
    // `resetMocks` xoá cài đặt của jest.fn trước MỖI test ⇒ dựng lại hàng đợi giả ở đây.
    (getQueue as jest.Mock).mockReturnValue({
      upsertJobScheduler: (...args: unknown[]) => upsertJobScheduler(...args),
      getJobSchedulers: () => Promise.resolve(existing),
      removeJobScheduler: (...args: unknown[]) => removeJobScheduler(...args),
    });
  });

  it("được upsert với schedulerId/pattern `30 2 * * *`/tz Asia/Ho_Chi_Minh/job cùng tên/attempts 1; scheduler đang có KHÔNG bị dọn", async () => {
    existing.length = 0;
    existing.push({ key: "dependency-counts.rebuild" });
    await syncCronSchedulers();
    const call = upsertJobScheduler.mock.calls.find((c) => c[0] === "dependency-counts.rebuild");
    expect(call).toBeDefined();
    expect(call?.[1]).toEqual({ pattern: "30 2 * * *", tz: "Asia/Ho_Chi_Minh" });
    expect(call?.[2]).toMatchObject({ name: "dependency-counts.rebuild", opts: { attempts: 1 } });
    expect(removeJobScheduler).not.toHaveBeenCalledWith("dependency-counts.rebuild");
  });
});
