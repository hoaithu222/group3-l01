jest.mock("../../../infrastructure/queue", () => ({
  registerJob: jest.fn(),
  defineCron: jest.fn(),
}));

import { defineCron, registerJob } from "../../../infrastructure/queue";
import {
  COLLAB_SNAPSHOT_JOB,
  clearCollabSnapshotRunners,
  listCollabSnapshotKinds,
  registerCollabSnapshotRunner,
  runCollabSnapshotHourly,
  type CollabSnapshotRunResult,
} from "../collab-snapshot-runners";
import { registerCollabSnapshotHourlyJob } from "../collab-snapshot-hourly";

afterEach(() => clearCollabSnapshotRunners());

const result = (over: Partial<CollabSnapshotRunResult> = {}): Promise<CollabSnapshotRunResult> => Promise.resolve({ scanned: 0, created: 0, pruned: 0, ...over });

describe("collab.snapshot-hourly — runner theo loại tài nguyên", () => {
  it("chạy MỌI runner đã đăng ký và trả kết quả theo loại; đăng ký lại cùng loại ghi đè (idempotent)", async () => {
    registerCollabSnapshotRunner("document", () => result({ scanned: 1, created: 1 }));
    registerCollabSnapshotRunner("whiteboard", () => result({ scanned: 5, created: 2, pruned: 1 }));
    expect(listCollabSnapshotKinds()).toEqual(["document", "whiteboard"]);
    expect(await runCollabSnapshotHourly()).toEqual({ document: { scanned: 1, created: 1, pruned: 0 }, whiteboard: { scanned: 5, created: 2, pruned: 1 } });

    registerCollabSnapshotRunner("document", () => result({ scanned: 9, created: 9, pruned: 9 }));
    expect(listCollabSnapshotKinds()).toEqual(["document", "whiteboard"]);
    expect((await runCollabSnapshotHourly()).document).toEqual({ scanned: 9, created: 9, pruned: 9 });
  });

  it("lỗi của một loại KHÔNG chặn loại còn lại; job vẫn báo thất bại ở cuối", async () => {
    const whiteboard = jest.fn(() => result({ scanned: 1, created: 1 }));
    registerCollabSnapshotRunner("document", () => Promise.reject(new Error("mongo lỗi")));
    registerCollabSnapshotRunner("whiteboard", whiteboard);
    await expect(runCollabSnapshotHourly()).rejects.toThrow("lỗi ở loại document");
    expect(whiteboard).toHaveBeenCalledTimes(1);
  });

  it("chưa có runner nào → không làm gì", async () => {
    expect(await runCollabSnapshotHourly()).toEqual({});
  });
});

describe("registerCollabSnapshotHourlyJob", () => {
  it("đăng ký ĐÚNG MỘT job + cron TĨNH collab.snapshot-hourly (queue cron, phút 7 mỗi giờ, attempts 1) — gọi lặp từ nhiều module vẫn cùng một khai báo", async () => {
    registerCollabSnapshotHourlyJob();
    registerCollabSnapshotHourlyJob();
    expect(COLLAB_SNAPSHOT_JOB).toEqual({ queue: "cron", name: "collab.snapshot-hourly" });
    const registered = (registerJob as unknown as jest.Mock<void, [string, string, () => Promise<void>]>).mock.calls;
    expect(registered.map(([queue, name]) => [queue, name])).toEqual([["cron", "collab.snapshot-hourly"], ["cron", "collab.snapshot-hourly"]]);
    const crons = (defineCron as unknown as jest.Mock<void, [unknown]>).mock.calls;
    expect(crons).toHaveLength(2);
    for (const [def] of crons) {
      expect(def).toEqual({ schedulerId: "collab.snapshot-hourly", queue: "cron", jobName: "collab.snapshot-hourly", pattern: "7 * * * *", opts: { attempts: 1 } });
    }

    // Processor đã đăng ký thật sự chạy các runner.
    const processor = registered[0]?.[2];
    const runner = jest.fn(() => result({ scanned: 1 }));
    registerCollabSnapshotRunner("whiteboard", runner);
    await processor?.();
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
