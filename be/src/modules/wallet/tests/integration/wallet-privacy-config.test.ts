import { installMocks, mockAuditRecord, redisStore } from "./wallet-test-mocks";
import { buildWalletApp, cleanupGroups, expenseBody, makeApi, seedGroup, tokenFor, type Group } from "./wallet-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { createWalletContainer } from "../../wallet.container";
import { WalletReminderService } from "../../services/wallet-reminder.service";

const app = buildWalletApp();
const api = makeApi(app);
const ACCOUNT = "9704123456789012";

describe("wallet — riêng tư, cấu hình, nhắc nợ, admin (integration)", () => {
  const groups: Group[] = [];
  const setup = async (spec: Parameters<typeof seedGroup>[0]) => {
    const g = await seedGroup(spec);
    groups.push(g);
    return g;
  };
  beforeEach(() => installMocks());
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const addProfile = (token: string, over: Record<string, unknown> = {}) =>
    api("post", "/me/payment-profiles", token, { bankBin: "970436", accountNumber: ACCOUNT, accountName: "Nguyễn Văn Ánh", ...over });

  describe("tài khoản nhận tiền", () => {
    it("số TK mã hoá trong DB, danh sách chỉ có 4 số cuối và tên IN HOA không dấu; tối đa 3 (WALLET_009)", async () => {
      const g = await setup({ A: "OWNER" });
      const token = tokenFor(g.ids.A);
      const created = await addProfile(token);

      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ accountLast4: "9012", accountName: "NGUYEN VAN ANH", bankName: "Vietcombank", isDefault: true });
      const listed = await api("get", "/me/payment-profiles", token);
      expect(JSON.stringify([created.body, listed.body])).not.toContain(ACCOUNT);
      expect(JSON.stringify([created.body, listed.body])).not.toContain("accountNumberEnc");

      const row = await prisma.userPaymentProfile.findFirst({ where: { userId: g.ids.A } });
      expect(row?.accountNumberEnc).toBeTruthy();
      expect(row?.accountNumberEnc).not.toContain(ACCOUNT);

      await addProfile(token, { accountNumber: "111111111" });
      await addProfile(token, { accountNumber: "222222222" });
      const fourth = await addProfile(token, { accountNumber: "333333333" });
      expect(fourth.status).toBe(409);
      expect(fourth.body.error.code).toBe("WALLET_009");
    });

    it("đặt mặc định / xoá hồ sơ mặc định → hồ sơ còn lại lên mặc định; không đụng hồ sơ của người khác", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER" });
      const first = (await addProfile(tokenFor(g.ids.A))).body.data.id as string;
      const second = (await addProfile(tokenFor(g.ids.A), { accountNumber: "222222222", isDefault: false })).body.data.id as string;
      expect((await api("get", "/me/payment-profiles", tokenFor(g.ids.A))).body.data.find((p: { isDefault: boolean }) => p.isDefault).id).toBe(first);

      expect((await api("post", `/me/payment-profiles/${second}/default`, tokenFor(g.ids.B))).status).toBe(404);
      expect((await api("delete", `/me/payment-profiles/${first}`, tokenFor(g.ids.B))).status).toBe(404);
      expect((await api("delete", `/me/payment-profiles/${first}`, tokenFor(g.ids.A))).status).toBe(200);
      const left = (await api("get", "/me/payment-profiles", tokenFor(g.ids.A))).body.data;
      expect(left).toHaveLength(1);
      expect(left[0]).toMatchObject({ id: second, isDefault: true });
    });

    it("IR-37: chỉ người ĐANG NỢ mới thấy số TK (kèm audit không có số TK); người không nợ / không có hồ sơ → 404", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
      const { A, B, C } = g.ids;
      await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B], { amount: 100_000 }));
      const info = `/workspaces/${g.workspaceId}/wallet/payees/${A}/payment-info`;

      // A chưa có hồ sơ → 404 dù B đang nợ.
      expect((await api("get", info, tokenFor(B))).status).toBe(404);
      await addProfile(tokenFor(A));

      const ok = await api("get", info, tokenFor(B));
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ bankBin: "970436", accountNumber: ACCOUNT, accountName: "NGUYEN VAN ANH", suggestedAmount: 50_000 });
      expect(ok.body.data.reference).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

      expect((await api("get", info, tokenFor(C))).status).toBe(404); // C không nợ A
      expect((await api("get", `/workspaces/${g.workspaceId}/wallet/payees/${B}/payment-info`, tokenFor(A))).status).toBe(404); // A là chủ nợ, không phải con nợ

      const audit = mockAuditRecord.mock.calls.map((c) => c[0] as { action: string; metadata: Record<string, unknown> });
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe("wallet.payment-info-view");
      expect(audit[0].metadata).toEqual({ viewerId: B, payeeId: A, workspaceId: g.workspaceId });
      expect(JSON.stringify(mockAuditRecord.mock.calls)).not.toContain(ACCOUNT);
    });

    it("mã tham chiếu payment-info dùng lại được khi tạo settlement", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER" });
      await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B], { amount: 100_000 }));
      await addProfile(tokenFor(g.ids.A));
      const reference = (await api("get", `/workspaces/${g.workspaceId}/wallet/payees/${g.ids.A}/payment-info`, tokenFor(g.ids.B))).body.data.reference as string;

      const s = await api("post", `/workspaces/${g.workspaceId}/settlements`, tokenFor(g.ids.B), { toId: g.ids.A, amount: 50_000, method: "BANK", reference });
      expect(s.body.data.code).toBe(reference);
    });
  });

  describe("cài đặt ví", () => {
    it("GET tạo ví mặc định; MEMBER không cập nhật được (403); ADMIN cập nhật với expectedVersion, lệch → 409", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER" });
      const base = `/workspaces/${g.workspaceId}/wallet`;
      const got = await api("get", base, tokenFor(g.ids.B));
      expect(got.body.data).toMatchObject({ reminderCron: "0 9 * * 5", timezone: "Asia/Ho_Chi_Minh", reminderTargetType: "NONE", walletVersion: 0, version: 1 });
      expect(got.body.data.myActions).toEqual({ canManageSettings: false, canRemind: false });

      const body = { reminderEnabled: true, reminderCron: "30 18 * * 1", timezone: "Asia/Bangkok", reminderTargetType: "NONE", reminderMinDebt: 20_000, expectedVersion: 1 };
      expect((await api("put", base, tokenFor(g.ids.B), body)).status).toBe(403);
      const ok = await api("put", base, tokenFor(g.ids.A), body);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ reminderCron: "30 18 * * 1", version: 2, reminderMinDebt: 20_000 });
      expect(ok.body.data.walletVersion).toBeGreaterThan(0);
      expect((await api("put", base, tokenFor(g.ids.A), body)).body.error.code).toBe("RES_003");
      expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "wallet.settings-update" }));
    });

    it("WALLET_008: nơi đăng nhắc không thuộc nhóm; cron/timezone sai → 400 VAL_001", async () => {
      const g = await setup({ A: "OWNER" });
      const base = `/workspaces/${g.workspaceId}/wallet`;
      const body = { reminderEnabled: true, reminderCron: "0 9 * * 5", timezone: "Asia/Ho_Chi_Minh", reminderMinDebt: 10_000, expectedVersion: 1 };

      const bad = await api("put", base, tokenFor(g.ids.A), { ...body, reminderTargetType: "CONVERSATION", reminderTargetId: newObjectId() });
      expect(bad.body.error.code).toBe("WALLET_008");
      for (const over of [{ reminderCron: "*/5 * * * *" }, { timezone: "Mars/Olympus" }, { reminderTargetType: "CHANNEL" }]) {
        const res = await api("put", base, tokenFor(g.ids.A), { ...body, reminderTargetType: "NONE", ...over });
        expect(res.body.error.code).toBe("VAL_001");
      }
    });

    it("nhắc ngay: chỉ ADMIN+, giới hạn 1 lần/giờ (WALLET_010)", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER" });
      const url = `/workspaces/${g.workspaceId}/wallet/remind`;
      expect((await api("post", url, tokenFor(g.ids.B))).status).toBe(403);

      const first = await api("post", url, tokenFor(g.ids.A));
      expect(first.status).toBe(200);
      expect(first.body.data).toEqual({ remindedCount: 0 });
      const second = await api("post", url, tokenFor(g.ids.A));
      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe("WALLET_010");
    });
  });

  describe("IR-06: nhắc nợ", () => {
    it("thông báo RIÊNG cho người nợ, tin nhóm KHÔNG có số tiền/tên, chạy lại không trùng", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER" });
      const { A, B, C, D } = g.ids;
      await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(A), expenseBody(A, [A, B, C, D]));
      const container = createWalletContainer();
      const targetId = newObjectId();
      await prisma.workspaceWallet.update({ where: { workspaceId: g.workspaceId }, data: { reminderTargetType: "CONVERSATION", reminderTargetId: targetId } });
      jest.spyOn(container.directory, "isValidReminderTarget").mockResolvedValue(true);
      const post = jest.fn().mockResolvedValue({});
      const reminder = new WalletReminderService(container.walletRepo, container.directory, { post });
      const now = new Date("2026-09-18T02:00:00.000Z"); // Thứ Sáu 09:00 Asia/Ho_Chi_Minh

      expect(await reminder.remind(g.workspaceId, { now })).toBe(3);
      expect(await reminder.remind(g.workspaceId, { now })).toBe(3);

      // Chỉ tính thông báo NHẮC NỢ (khoản chi ban đầu cũng đã sinh thông báo expense-added cho B, C, D).
      const reminders = await prisma.notification.findMany({ where: { workspaceId: g.workspaceId, type: "wallet.debt-reminder" }, select: { id: true } });
      const reminderIds = reminders.map((n) => n.id);
      const recipients = await prisma.notificationRecipient.findMany({ where: { notificationId: { in: reminderIds } } });
      expect(recipients.map((r) => r.recipientId).sort()).toEqual([B, C, D].sort());
      // Guard `notificationExists` chặn ghi `deliver` lần 2 (outbox.add là create thuần — trùng khoá sẽ làm hỏng transaction).
      const delivers = await prisma.outboxEvent.count({ where: { type: "notification.deliver", OR: reminderIds.map((id) => ({ aggregateId: { startsWith: id } })) } });
      expect(delivers).toBe(3);

      const own = await prisma.notification.findFirst({ where: { workspaceId: g.workspaceId, type: "wallet.debt-reminder" } });
      expect(own?.refs).toMatchObject({ amount: 37_500, suggestionsTo: [A] });

      expect(post).toHaveBeenCalledTimes(2); // dedupeKey theo ngày → message engine gộp; tin gửi không có số tiền
      const posted = post.mock.calls[0][0] as { payload: Record<string, unknown>; systemType: string; dedupeKey: string };
      expect(posted.systemType).toBe("WALLET_REMINDER");
      expect(posted.payload).toEqual({ workspaceId: g.workspaceId, debtorsCount: 3 });
      expect(JSON.stringify(posted)).not.toMatch(/37500|112500|amount/);
      expect(post.mock.calls[1][0]).toMatchObject({ dedupeKey: posted.dedupeKey });
    });

    it("nợ dưới ngưỡng, ví tắt nhắc, hoặc người nợ đã là GUEST → không thông báo", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
      await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B, g.ids.C], { amount: 9_000 })); // 3.000/người < 10.000
      const c = createWalletContainer();
      const reminder = new WalletReminderService(c.walletRepo, c.directory, { post: jest.fn() });

      expect(await reminder.remind(g.workspaceId)).toBe(0);
      await prisma.workspaceWallet.update({ where: { workspaceId: g.workspaceId }, data: { reminderMinDebt: 1_000 } });
      await prisma.workspaceMembership.updateMany({ where: { workspaceId: g.workspaceId, userId: g.ids.C }, data: { role: "GUEST" } });
      expect(await reminder.remind(g.workspaceId)).toBe(1); // chỉ B
      await prisma.workspaceWallet.update({ where: { workspaceId: g.workspaceId }, data: { reminderEnabled: false } });
      expect(await reminder.remind(g.workspaceId, { now: new Date("2026-09-25T02:00:00Z") })).toBe(0);
      expect(await reminder.remind(g.workspaceId, { now: new Date("2026-09-25T02:00:00Z"), manual: true })).toBe(1); // nhắc ngay bỏ qua công tắc định kỳ
    });
  });

  describe("admin: wallet-stats ẩn danh", () => {
    it("chỉ số đếm + dải giá trị, KHÔNG có userId/số tiền; cần quyền workspace:view; kênh riêng tư không lộ tên", async () => {
      const g = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" });
      await api("post", `/workspaces/${g.workspaceId}/expenses`, tokenFor(g.ids.A), expenseBody(g.ids.A, [g.ids.A, g.ids.B, g.ids.C], { amount: 150_000 }));
      const sid = (await api("post", `/workspaces/${g.workspaceId}/settlements`, tokenFor(g.ids.B), { toId: g.ids.A, amount: 50_000, method: "CASH" })).body.data.id as string;
      await api("post", `/settlements/${sid}/confirm`, tokenFor(g.ids.A));
      const url = `/admin/workspaces/${g.workspaceId}/wallet-stats`;

      expect((await api("get", url, tokenFor(g.ids.A))).status).toBe(403); // user thường không có workspace:view
      const res = await api("get", url, tokenFor(newObjectId(), "admin"));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        enabled: true,
        reminder: { enabled: true, cronText: "Thứ Sáu 09:00 Asia/Ho_Chi_Minh", targetType: "NONE", targetChannelName: null },
        last30d: { expensesCount: 1, confirmedSettlements: 1, staleSettlements: 0, debtorsCount: 1, spendBand: "LT_500K" },
      });
      const json = JSON.stringify(res.body);
      for (const id of Object.values(g.ids)) expect(json).not.toContain(id);
      expect(json).not.toMatch(/"(userId|amount|balance|accountNumber)"/);
      expect((await api("get", `/admin/workspaces/${newObjectId()}/wallet-stats`, tokenFor(newObjectId(), "admin"))).status).toBe(404);
    });
  });
});
