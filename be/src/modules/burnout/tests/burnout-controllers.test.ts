/**
 * Unit — controller factory của `burnout` (api-patterns.md): chỉ parse request → gọi service → trả response chuẩn. Kiểm: `userId` LUÔN lấy từ token (kể cả khi body/params/query cố nhét userId khác), mã HTTP (200/204),
 * chưa đăng nhập → 401, admin controller chuyển đúng body và người thực hiện.
 */
import type { Request, Response } from "express";
import { createAdminBurnoutController } from "../controllers/admin-burnout.controller";
import { createBurnoutController } from "../controllers/burnout.controller";
import type { BurnoutAdminService } from "../services/burnout-admin.service";
import type { BurnoutHistoryService } from "../services/burnout-history.service";
import type { BurnoutSettingService } from "../services/burnout-setting.service";

interface Sent {
  status: number;
  body?: { success: boolean; data?: unknown; message?: string };
  headers: Record<string, string>;
  ended: boolean;
}

function fakeRes(): { res: Response; sent: Sent } {
  const sent: Sent = { status: 0, headers: {}, ended: false };
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: Sent["body"]) {
      sent.body = body;
      return res;
    },
    end() {
      sent.ended = true;
      return res;
    },
    setHeader(name: string, value: string) {
      sent.headers[name] = value;
      return res;
    },
  } as unknown as Response;
  return { res, sent };
}

const ME = "1".repeat(24);
const ATTACKER = "2".repeat(24);
const req = (over: Partial<{ params: Record<string, string>; body: unknown; query: unknown; user: object | null }> = {}): Request =>
  ({ user: over.user === undefined ? { id: ME, role: "user" } : (over.user ?? undefined), params: over.params ?? {}, body: over.body ?? {}, query: over.query ?? {} }) as unknown as Request;

/** `catchAsync` trả hàm bọc Promise — chờ vi tác vụ để handler xong; lỗi đi qua `next`. */
const run = async (handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown, request: Request, res: Response): Promise<unknown> => {
  let error: unknown;
  await new Promise<void>((resolve) => {
    const result = handler(request, res, (err) => {
      error = err;
      resolve();
    });
    void Promise.resolve(result).then(() => setImmediate(resolve));
  });
  return error;
};

describe("createBurnoutController", () => {
  const settings = { get: jest.fn(), update: jest.fn(), deleteMyData: jest.fn() };
  const history = { history: jest.fn(), acknowledge: jest.fn() };
  const controller = () => createBurnoutController({ settings: settings as unknown as BurnoutSettingService, history: history as unknown as BurnoutHistoryService });

  beforeEach(() => {
    settings.get.mockResolvedValue({ enabled: false });
    settings.update.mockResolvedValue({ enabled: true });
    settings.deleteMyData.mockResolvedValue(undefined);
    history.history.mockResolvedValue({ days: 7, dailies: [], assessments: [] });
    history.acknowledge.mockResolvedValue(undefined);
  });

  it("GET /me/wellbeing: 200, dùng id của TOKEN", async () => {
    const { res, sent } = fakeRes();
    await run(controller().get, req({ query: { userId: ATTACKER }, params: { userId: ATTACKER } }), res);
    expect(settings.get).toHaveBeenCalledWith(ME);
    expect(sent.status).toBe(200);
    expect(sent.headers["Cache-Control"]).toBe("no-store"); // dữ liệu sức khoẻ tinh thần: không cho bộ nhớ đệm giữ
    expect(sent.body).toMatchObject({ success: true, data: { enabled: false } });
  });

  it("PUT /me/wellbeing: chuyển body cho service với id của token (body có userId lạ không đổi người bị tác động); thông điệp theo bật/tắt", async () => {
    const { res, sent } = fakeRes();
    await run(controller().update, req({ body: { optIn: true, userId: ATTACKER } }), res);
    expect(settings.update).toHaveBeenCalledWith(ME, { optIn: true, userId: ATTACKER });
    expect(sent.body?.message).toBe("Đã lưu cài đặt");
    expect(sent.headers["Cache-Control"]).toBe("no-store");
    settings.update.mockResolvedValue({ enabled: false });
    const off = fakeRes();
    await run(controller().update, req({ body: { optIn: false } }), off.res);
    expect(off.sent.body?.message).toContain("xoá dữ liệu");
  });

  it("GET /me/wellbeing/assessments: chuyển `days`, 200", async () => {
    const { res, sent } = fakeRes();
    await run(controller().assessments, req({ query: { days: 30 } }), res);
    expect(history.history).toHaveBeenCalledWith(ME, 30);
    expect(sent.status).toBe(200);
    expect(sent.headers["Cache-Control"]).toBe("no-store");
  });

  it("POST /me/wellbeing/alerts/:id/ack: 204 không thân; id cảnh báo từ path, hành động từ body, người từ token", async () => {
    const { res, sent } = fakeRes();
    await run(controller().ack, req({ params: { id: "a".repeat(24) }, body: { action: "SNOOZE" } }), res);
    expect(history.acknowledge).toHaveBeenCalledWith(ME, "a".repeat(24), "SNOOZE");
    expect(sent).toMatchObject({ status: 204, ended: true });
    expect(sent.body).toBeUndefined();
  });

  it("DELETE /me/wellbeing/data: 204", async () => {
    const { res, sent } = fakeRes();
    await run(controller().deleteData, req(), res);
    expect(settings.deleteMyData).toHaveBeenCalledWith(ME);
    expect(sent).toMatchObject({ status: 204, ended: true });
  });

  it("chưa đăng nhập → 401, service không được gọi", async () => {
    for (const handler of Object.values(controller())) {
      const { res } = fakeRes();
      const error = await run(handler as never, req({ user: null }), res);
      expect(error).toMatchObject({ statusCode: 401 });
    }
    expect(settings.get).not.toHaveBeenCalled();
    expect(settings.update).not.toHaveBeenCalled();
    expect(settings.deleteMyData).not.toHaveBeenCalled();
    expect(history.history).not.toHaveBeenCalled();
    expect(history.acknowledge).not.toHaveBeenCalled();
  });

  it("lỗi nghiệp vụ (WELL_001) đi qua next → errorHandler, controller không tự bắt", async () => {
    history.history.mockRejectedValue(Object.assign(new Error("x"), { statusCode: 409, errorCode: "WELL_001" }));
    const { res, sent } = fakeRes();
    expect(await run(controller().assessments, req({ query: { days: 7 } }), res)).toMatchObject({ errorCode: "WELL_001" });
    expect(sent.status).toBe(0);
  });
});

describe("createAdminBurnoutController", () => {
  const admin = { overview: jest.fn(), rules: jest.fn(), updateRules: jest.fn() };
  const controller = () => createAdminBurnoutController({ admin: admin as unknown as BurnoutAdminService });

  beforeEach(() => {
    admin.overview.mockResolvedValue({ insufficient: true, minimum: 20 });
    admin.rules.mockResolvedValue({ version: 1 });
    admin.updateRules.mockResolvedValue({ version: 2 });
  });

  it("GET overview/rules: 200", async () => {
    const a = fakeRes();
    await run(controller().overview, req({ query: { weeks: 4 } }), a.res);
    expect(admin.overview).toHaveBeenCalledWith(4);
    expect(a.sent.status).toBe(200);
    const b = fakeRes();
    await run(controller().getRules, req(), b.res);
    expect(b.sent.body).toMatchObject({ data: { version: 1 } });
  });

  it("PUT rules: tách expectedVersion/reason khỏi bộ luật, truyền người thực hiện (id + vai trò) từ token", async () => {
    const { res, sent } = fakeRes();
    const body = { expectedVersion: 1, reason: "Điều chỉnh ngưỡng theo phản hồi", windowDays: 7, levels: { medium: 40, high: 70 }, rules: [] };
    await run(controller().putRules, req({ body, user: { id: "9".repeat(24), role: "admin" } }), res);
    expect(admin.updateRules).toHaveBeenCalledWith(body, { id: "9".repeat(24), role: "admin" });
    expect(sent.status).toBe(200);
  });

  it("PUT rules khi chưa đăng nhập → 401", async () => {
    const { res } = fakeRes();
    expect(await run(controller().putRules, req({ user: null, body: {} }), res)).toMatchObject({ statusCode: 401 });
    expect(admin.updateRules).not.toHaveBeenCalled();
  });
});
