import { installMocks, redisStore } from "./contribution-test-mocks";
import { buildRig, cleanupGroups, ensureContributionIndexes, makeApi, seedGroup, tokenFor, type Group } from "./contribution-test-kit";

// Kit dựng container thật ngay lúc import (`new AuditService()`) nên factory phải TỰ đủ — không tham chiếu biến khai báo sau (TDZ).
jest.mock("../../../audit-log/audit-log.service", () => {
  const record = jest.fn().mockResolvedValue(undefined);
  return { AuditService: jest.fn().mockImplementation(() => ({ record })) };
});

import express from "express";
import request from "supertest";
import { initRuntimeConfig, resetRuntimeConfig } from "../../../../core/config/runtime-config";
import { CONTRIBUTION_DEFAULTS_CONFIG_KEY } from "../../../../core/constants/contribution";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { PrismaSystemConfigRepository } from "../../../system-config/repositories/system-config.repository.prisma";
import systemConfigRoutes from "../../../system-config/system-config.routes";

/**
 * Hợp đồng ADMIN → BE của mặc định công thức (`pm.contribution`): admin lưu ở `PUT /admin/system-config/:key` thì bảng MỚI của nhóm nhận công thức đó, bảng đã có
 * giữ công thức đã đóng băng. Test này bắt lỗi tên khoá — tên `pm.contribution.defaults` trong kế hoạch có 3 đoạn nên `:key` bị validator từ chối (400) và admin không lưu được gì.
 */
const rig = buildRig();
const api = makeApi(rig.app);
const adminApp = express();
adminApp.use(express.json());
adminApp.use("/api/v1/admin/system-config", systemConfigRoutes);
adminApp.use(notFoundHandler);
adminApp.use(errorHandler);

const adminToken = (): string => tokenFor(newObjectId(), "admin");
const url = `/api/v1/admin/system-config/${CONTRIBUTION_DEFAULTS_CONFIG_KEY}`;

describe("contribution — mặc định công thức do admin đặt (system-config pm.contribution)", () => {
  const groups: Group[] = [];
  const setup = async () => {
    const g = await seedGroup({ A: "OWNER", C: "MEMBER" });
    groups.push(g);
    return g;
  };
  const weightsOf = async (g: Group) => {
    const res = await api("get", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.C));
    expect(res.status).toBe(200);
    return { weights: res.body.data.weights as Record<string, number>, isDefault: res.body.data.isDefault as boolean };
  };

  beforeAll(async () => {
    await ensureContributionIndexes();
    initRuntimeConfig(new PrismaSystemConfigRepository());
  });
  beforeEach(() => installMocks());
  afterEach(async () => {
    await prisma.systemConfig.deleteMany({ where: { key: CONTRIBUTION_DEFAULTS_CONFIG_KEY } });
    resetRuntimeConfig();
    initRuntimeConfig(new PrismaSystemConfigRepository());
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  it("khoá đi qua route admin: GET được nhận (không 400), trả mặc định D-09 60/20/20", async () => {
    const res = await request(adminApp).get(url).set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.effective).toEqual({ weights: { points: 60, onTime: 20, peer: 20 }, onTimeGraceHours: 0, unestimatedPoints: 1 });
  });

  it("PUT 50/30/20 → bảng MỚI dùng công thức mới; bảng đã có state giữ bản ĐÃ ĐÓNG BĂNG (không đổi âm thầm)", async () => {
    const before = await setup();
    expect(await weightsOf(before)).toEqual({ weights: { points: 60, onTime: 20, peer: 20 }, isDefault: true }); // tạo state → đóng băng 60/20/20

    const put = await request(adminApp)
      .put(url)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ value: { weights: { points: 50, onTime: 30, peer: 20 }, onTimeGraceHours: 12 }, expectedVersion: 0, reason: "Nhà trường yêu cầu tăng trọng số đúng hạn" });
    expect(put.status).toBe(200);

    const after = await setup();
    expect(await weightsOf(after)).toEqual({ weights: { points: 50, onTime: 30, peer: 20 }, isDefault: true });
    expect(await weightsOf(before)).toEqual({ weights: { points: 60, onTime: 20, peer: 20 }, isDefault: true });
  });

  it("tổng trọng số ≠ 100 → 400 VAL_001 (không lưu)", async () => {
    const res = await request(adminApp)
      .put(url)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ value: { weights: { points: 50, onTime: 30, peer: 30 } }, expectedVersion: 0, reason: "Thử lưu tổng trọng số sai" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VAL_001");
    expect(await prisma.systemConfig.count({ where: { key: CONTRIBUTION_DEFAULTS_CONFIG_KEY } })).toBe(0);
  });

  it("tên khoá 3 đoạn trong kế hoạch gốc bị route từ chối (đó là lý do phải dùng khoá 2 đoạn)", async () => {
    const res = await request(adminApp).get("/api/v1/admin/system-config/pm.contribution.defaults").set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });
});
