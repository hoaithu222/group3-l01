/**
 * `mail.jobs.ts` gọi `registerJob(...)` khi được import (side-effect, giống
 * `asset.jobs.test.ts`) — mock `../../queue/worker` để bắt lại processor mà
 * không cần Redis/BullMQ thật. Mock `nodemailer` để không gửi mail thật, và
 * mock `../../../core/config` để `NodemailerService` không chạy no-op mode
 * (cần SMTP_HOST/USER/PASS "có vẻ" hợp lệ).
 */
type JobLike = { data: unknown };
type Processor = (job: JobLike) => Promise<unknown>;

const sendMailMock = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
}));

jest.mock("../../../core/config", () => ({
  env: {
    SMTP_HOST: "smtp.test.local",
    SMTP_PORT: 587,
    SMTP_USER: "user",
    SMTP_PASS: "pass",
    SMTP_FROM: "noreply@test.local",
    FRONTEND_URL: "http://localhost:5173",
  },
}));

// `nodemailer.service.ts` import `enqueue` từ barrel `../../queue` (dùng cho
// `enqueueMail`, không đụng tới trong test này) — mock rỗng để không kéo theo
// toàn bộ hạ tầng queue thật (Prisma/Redis/metrics) chỉ để test `mail.send`.
jest.mock("../../queue", () => ({ enqueue: jest.fn() }));

const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../queue/worker", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
}));

import { UnrecoverableError } from "bullmq";
import { logger } from "../../logger";
import "../mail.jobs";

function getProcessor(): Processor {
  const call = mockRegistered.find((c) => c[0] === "notifications" && c[1] === "mail.send");
  if (!call) throw new Error("Không tìm thấy processor mail.send đã đăng ký");
  return call[2];
}

describe("mail.jobs — processor notifications/mail.send", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
  });

  it("đăng ký đúng processor notifications/mail.send", () => {
    expect(mockRegistered).toContainEqual(["notifications", "mail.send", expect.any(Function)]);
  });

  it("lỗi tạm thời 2 lần rồi thành công lần 3 (giả lập BullMQ gọi lại processor sau mỗi lần retry)", async () => {
    sendMailMock
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce({ messageId: "abc-123" });

    const processor = getProcessor();
    const job: JobLike = { data: { template: "welcome", to: "user@example.com", vars: { name: "A" } } };

    await expect(processor(job)).rejects.toThrow("ETIMEDOUT");
    await expect(processor(job)).rejects.toThrow("ETIMEDOUT");
    await expect(processor(job)).resolves.toBeUndefined();

    expect(sendMailMock).toHaveBeenCalledTimes(3);
  });

  it("lỗi SMTP vĩnh viễn (responseCode 5xx) ném UnrecoverableError — BullMQ sẽ không retry", async () => {
    const permanentErr = Object.assign(new Error("Mailbox không tồn tại"), { responseCode: 550 });
    sendMailMock.mockRejectedValueOnce(permanentErr);

    const processor = getProcessor();
    const job: JobLike = { data: { template: "welcome", to: "bad@example.com", vars: {} } };

    await expect(processor(job)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("lỗi tạm thời (không có responseCode 5xx) ném lỗi thường — BullMQ vẫn retry theo backoff", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("Kết nối SMTP timeout"));

    const processor = getProcessor();
    const job: JobLike = { data: { template: "welcome", to: "user@example.com", vars: {} } };

    await expect(processor(job)).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it("che địa chỉ email khi log lỗi — không log 'to' đầy đủ", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("lỗi tạm thời"));
    const processor = getProcessor();
    const job: JobLike = { data: { template: "welcome", to: "someone@example.com", vars: {} } };

    await expect(processor(job)).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      "[mail.send] Gửi email thất bại",
      expect.objectContaining({ to: "s***@example.com" })
    );
  });
});
