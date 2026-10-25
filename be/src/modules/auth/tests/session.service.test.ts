import { SessionService } from "../services/session.service";

const mockFindFirst = jest.fn();

jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    session: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

jest.mock("../../../core/auth/biometric-credential-revoker", () => ({
  BiometricCredentialRevoker: { revokeAllForUser: jest.fn().mockResolvedValue(0) },
}));

describe("SessionService.isKnownDevice", () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService();
    mockFindFirst.mockReset();
  });

  it("khớp theo deviceId → true, ưu tiên deviceId (không cần gọi tra theo userAgent+ipAddress)", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "s1" });

    const known = await service.isKnownDevice("user-1", { deviceId: "device-abc" });

    expect(known).toBe(true);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", deviceId: "device-abc" }),
      })
    );
  });

  it("không truyền deviceId, chỉ userAgent+ipAddress khớp → true (đúng 1 lượt tra)", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "s2" });

    const known = await service.isKnownDevice("user-1", {
      userAgent: "Mozilla/5.0",
      ipAddress: "1.2.3.4",
    });

    expect(known).toBe(true);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });

  it("deviceId không khớp NHƯNG userAgent+ipAddress khớp → vẫn true (thử cả 2 tiêu chí)", async () => {
    mockFindFirst.mockResolvedValueOnce(null); // tra theo deviceId — không khớp
    mockFindFirst.mockResolvedValueOnce({ id: "s2b" }); // tra theo userAgent+ipAddress — khớp

    const known = await service.isKnownDevice("user-1", {
      deviceId: "device-moi",
      userAgent: "Mozilla/5.0",
      ipAddress: "1.2.3.4",
    });

    expect(known).toBe(true);
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });

  it("không khớp gì cả → false", async () => {
    mockFindFirst.mockResolvedValue(null);

    const known = await service.isKnownDevice("user-1", {
      deviceId: "device-la",
      userAgent: "Mozilla/5.0",
      ipAddress: "1.2.3.4",
    });

    expect(known).toBe(false);
  });

  it("KHÔNG lọc theo revokedAt — session đã logout vẫn tính là 'đã biết'", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "s3" });

    await service.isKnownDevice("user-1", { deviceId: "device-abc" });

    const whereArg = mockFindFirst.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("revokedAt");
  });

  it("chỉ tính thiết bị/vị trí trong 90 ngày gần nhất (createdAt >= since)", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await service.isKnownDevice("user-1", { deviceId: "device-abc" });

    const whereArg = mockFindFirst.mock.calls[0][0].where;
    expect(whereArg.createdAt.gte).toBeInstanceOf(Date);
    const daysAgo = (Date.now() - whereArg.createdAt.gte.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeCloseTo(90, 0);
  });
});
