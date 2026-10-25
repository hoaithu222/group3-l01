const envState: Record<string, unknown> = {};

jest.mock("../../queue", () => ({ QUEUE_NAMES: ["cron"], getQueue: jest.fn() }));
jest.mock("../../database", () => ({ prisma: { outboxEvent: { count: jest.fn() } } }));
jest.mock("../../../core/config", () => ({ env: envState }));

import request from "supertest";
import { getQueue } from "../../queue";
import { prisma } from "../../database";
import { queueJobsTotal } from "../metrics.client";
import { createWorkerMetricsApp, startWorkerMetricsServer, stopWorkerMetricsServer } from "../worker-metrics-server";

/**
 * p0-11 — cổng metrics riêng của worker: Prometheus scrape `worker:9464/metrics` (Bearer METRICS_TOKEN); `/health/live` cho Docker healthcheck không cần token.
 * `supertest` nối từ 127.0.0.1 — `metricsHandler` cho localhost qua không cần token, nên ca "cần token" giả `req.ip` bằng `trust proxy` + X-Forwarded-For.
 */
describe("worker metrics server", () => {
  beforeEach(() => {
    // resetMocks (jest.config) xoá mọi triển khai mock trước mỗi ca — dựng lại ở đây.
    (getQueue as jest.Mock).mockReturnValue({ getJobCounts: jest.fn().mockResolvedValue({ waiting: 4 }) });
    (prisma.outboxEvent.count as jest.Mock).mockResolvedValue(0);
    for (const key of Object.keys(envState)) delete envState[key];
    Object.assign(envState, { METRICS_ENABLED: true, METRICS_TOKEN: "s3cret-token", WORKER_METRICS_PORT: 9464 });
  });

  it("GET /health/live → 200 { status: ok } không cần token", async () => {
    const res = await request(createWorkerMetricsApp()).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /metrics từ localhost → prometheus text có số liệu tiến trình worker (queue_jobs_total)", async () => {
    queueJobsTotal.inc({ queue: "push", status: "completed" });
    const res = await request(createWorkerMetricsApp()).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("queue_jobs_total");
    expect(res.text).toContain('queue_waiting{queue="cron"} 4');
  });

  it("từ mạng ngoài localhost: thiếu/sai Bearer → 401, đúng METRICS_TOKEN → 200", async () => {
    const app = createWorkerMetricsApp();
    app.set("trust proxy", true);
    const remote = (token?: string) => {
      const r = request(app).get("/metrics").set("X-Forwarded-For", "10.0.0.7");
      return token ? r.set("Authorization", `Bearer ${token}`) : r;
    };
    expect((await remote()).status).toBe(401);
    expect((await remote("sai")).status).toBe(401);
    expect((await remote("s3cret-token")).status).toBe(200);
  });

  it("không mở cổng khi WORKER_METRICS_PORT=0 hoặc METRICS_ENABLED=false", async () => {
    expect(startWorkerMetricsServer(0)).toBeNull();
    envState.METRICS_ENABLED = false;
    expect(startWorkerMetricsServer(19464)).toBeNull();
    await expect(stopWorkerMetricsServer()).resolves.toBeUndefined();
  });
});
