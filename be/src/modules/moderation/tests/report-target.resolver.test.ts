/**
 * Unit — `ReportTargetResolver` (be.md p1-08 §5.1): đích × công khai/riêng tư/1-1 → `scope`, `scopeIsPrivate`,
 * `handlerLevel`; 404 trung tính `MOD_002`; `MOD_003`; `BLOCK_001` (tự báo cáo). Port/danh bạ/quyền đều giả.
 */
import { ReportTargetResolver } from "../services/report-target.resolver";
import type { ModerationMessageRef } from "../../../shared/ports/message-moderation.port";
import { AUTHOR, CHANNEL_ID, CONV_ID, MSG_ID, REPORTER, WS, conversation, makeDirectory, makeMessagePort, oid, publicChannel } from "./report-fixtures";

type Resolved = { visible: boolean; role: string | null; actions: Set<never> };
const visible: Resolved = { visible: true, role: "MEMBER", actions: new Set<never>() };
const invisible: Resolved = { visible: false, role: null, actions: new Set<never>() };
const access = (resolved: Resolved = visible) => ({ resolve: jest.fn().mockResolvedValue(resolved) });

const ref = (over: Partial<ModerationMessageRef> = {}): ModerationMessageRef => ({
  id: MSG_ID,
  scopeType: "CHANNEL",
  scopeId: CHANNEL_ID,
  workspaceId: WS,
  authorId: AUTHOR,
  kind: "USER",
  deleted: false,
  excerpt: "nội dung",
  createdAt: new Date(),
  ...over,
});

describe("ReportTargetResolver — MESSAGE", () => {
  it("tin kênh PUBLIC → SCOPE, không private, tác giả + workspace lấy từ kênh", async () => {
    const resolver = new ReportTargetResolver(
      makeMessagePort({ findReadable: jest.fn().mockResolvedValue(ref()) }),
      makeDirectory({ findChannels: jest.fn().mockResolvedValue([publicChannel()]) }),
      access()
    );
    await expect(resolver.resolve(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).resolves.toMatchObject({
      groupKey: `MESSAGE:${MSG_ID}`,
      scopeType: "CHANNEL",
      scopeId: CHANNEL_ID,
      scopeIsPrivate: false,
      workspaceId: WS,
      targetAuthorId: AUTHOR,
      handlerLevel: "SCOPE",
    });
  });

  it("tin kênh PRIVATE → SCOPE + scopeIsPrivate (D-06)", async () => {
    const resolver = new ReportTargetResolver(
      makeMessagePort({ findReadable: jest.fn().mockResolvedValue(ref()) }),
      makeDirectory({ findChannels: jest.fn().mockResolvedValue([publicChannel({ visibility: "PRIVATE" })]) }),
      access()
    );
    await expect(resolver.resolve(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).resolves.toMatchObject({
      scopeIsPrivate: true,
      handlerLevel: "SCOPE",
    });
  });

  it("tin nhóm chat → SCOPE + private; tin 1-1 → PLATFORM_ONLY + private, không workspace", async () => {
    const group = new ReportTargetResolver(
      makeMessagePort({ findReadable: jest.fn().mockResolvedValue(ref({ scopeType: "CONVERSATION", scopeId: CONV_ID })) }),
      makeDirectory({ findConversations: jest.fn().mockResolvedValue([conversation()]) }),
      access()
    );
    await expect(group.resolve(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).resolves.toMatchObject({
      scopeType: "CONVERSATION",
      scopeIsPrivate: true,
      handlerLevel: "SCOPE",
      workspaceId: WS,
    });

    const direct = new ReportTargetResolver(
      makeMessagePort({ findReadable: jest.fn().mockResolvedValue(ref({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null })) }),
      makeDirectory({ findConversations: jest.fn().mockResolvedValue([conversation({ kind: "DIRECT", workspaceId: null })]) }),
      access()
    );
    await expect(direct.resolve(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).resolves.toMatchObject({
      scopeIsPrivate: true,
      handlerLevel: "PLATFORM_ONLY",
      workspaceId: null,
    });
  });

  it("MOD-02: không đọc được tin (kênh private không grant) / tin đã gỡ → 404 MOD_002 trung tính", async () => {
    const unreadable = new ReportTargetResolver(makeMessagePort(), makeDirectory(), access());
    await expect(unreadable.resolve(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "MOD_002",
    });

    const deleted = new ReportTargetResolver(
      makeMessagePort({ findReadable: jest.fn().mockResolvedValue(ref({ deleted: true })) }),
      makeDirectory(),
      access()
    );
    await expect(deleted.resolve(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).rejects.toMatchObject({ errorCode: "MOD_002" });
  });

  it("tin hệ thống → MOD_003; tin của chính mình → BLOCK_001", async () => {
    const system = new ReportTargetResolver(
      makeMessagePort({ findReadable: jest.fn().mockResolvedValue(ref({ kind: "SYSTEM", authorId: null })) }),
      makeDirectory(),
      access()
    );
    await expect(system.resolve(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).rejects.toMatchObject({ errorCode: "MOD_003" });

    const own = new ReportTargetResolver(
      makeMessagePort({ findReadable: jest.fn().mockResolvedValue(ref({ authorId: REPORTER.id })) }),
      makeDirectory(),
      access()
    );
    await expect(own.resolve(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).rejects.toMatchObject({ statusCode: 400, errorCode: "BLOCK_001" });
  });
});

describe("ReportTargetResolver — USER / CHANNEL / CONVERSATION", () => {
  const target = oid("7");

  it("USER không ngữ cảnh → PLATFORM_ONLY; có ngữ cảnh + cả hai là thành viên → SCOPE(workspace); thiếu → 404", async () => {
    const dir = makeDirectory({ findUsers: jest.fn().mockResolvedValue([{ id: target, name: "B" }]) });
    const resolver = new ReportTargetResolver(makeMessagePort(), dir, access());

    await expect(resolver.resolve(REPORTER, { targetType: "USER", targetId: target, reason: "HARASSMENT" })).resolves.toMatchObject({
      handlerLevel: "PLATFORM_ONLY",
      workspaceId: null,
      targetAuthorId: target,
    });
    await expect(
      resolver.resolve(REPORTER, { targetType: "USER", targetId: target, reason: "HARASSMENT", contextWorkspaceId: WS })
    ).resolves.toMatchObject({ handlerLevel: "SCOPE", workspaceId: WS, scopeIsPrivate: false });

    const notMember = new ReportTargetResolver(makeMessagePort(), makeDirectory({ findUsers: dir.findUsers, isActiveWorkspaceMember: jest.fn().mockResolvedValue(false) }), access());
    await expect(
      notMember.resolve(REPORTER, { targetType: "USER", targetId: target, reason: "HARASSMENT", contextWorkspaceId: WS })
    ).rejects.toMatchObject({ errorCode: "MOD_002" });
  });

  it("USER: tự báo cáo mình → BLOCK_001; user không tồn tại → MOD_002", async () => {
    const resolver = new ReportTargetResolver(makeMessagePort(), makeDirectory(), access());
    await expect(resolver.resolve(REPORTER, { targetType: "USER", targetId: REPORTER.id, reason: "SPAM" })).rejects.toMatchObject({ errorCode: "BLOCK_001" });
    await expect(resolver.resolve(REPORTER, { targetType: "USER", targetId: target, reason: "SPAM" })).rejects.toMatchObject({ errorCode: "MOD_002" });
  });

  it("CHANNEL public → SCOPE; private → PLATFORM_ONLY + private; không đọc được → 404", async () => {
    const dirPublic = makeDirectory({ findChannels: jest.fn().mockResolvedValue([publicChannel()]) });
    await expect(
      new ReportTargetResolver(makeMessagePort(), dirPublic, access()).resolve(REPORTER, { targetType: "CHANNEL", targetId: CHANNEL_ID, reason: "SPAM" })
    ).resolves.toMatchObject({ handlerLevel: "SCOPE", scopeIsPrivate: false, scopeType: "CHANNEL", targetAuthorId: null });

    const dirPrivate = makeDirectory({ findChannels: jest.fn().mockResolvedValue([publicChannel({ visibility: "PRIVATE" })]) });
    await expect(
      new ReportTargetResolver(makeMessagePort(), dirPrivate, access()).resolve(REPORTER, { targetType: "CHANNEL", targetId: CHANNEL_ID, reason: "SPAM" })
    ).resolves.toMatchObject({ handlerLevel: "PLATFORM_ONLY", scopeIsPrivate: true });

    await expect(
      new ReportTargetResolver(makeMessagePort(), dirPublic, access(invisible)).resolve(REPORTER, { targetType: "CHANNEL", targetId: CHANNEL_ID, reason: "SPAM" })
    ).rejects.toMatchObject({ errorCode: "MOD_002" });
  });

  it("CONVERSATION GROUP → PLATFORM_ONLY + private; DIRECT → MOD_003 (báo cáo người dùng thay thế); không phải thành viên → 404", async () => {
    const group = makeDirectory({ findConversations: jest.fn().mockResolvedValue([conversation()]) });
    await expect(
      new ReportTargetResolver(makeMessagePort(), group, access()).resolve(REPORTER, { targetType: "CONVERSATION", targetId: CONV_ID, reason: "SPAM" })
    ).resolves.toMatchObject({ handlerLevel: "PLATFORM_ONLY", scopeIsPrivate: true, scopeType: "CONVERSATION" });

    const direct = makeDirectory({ findConversations: jest.fn().mockResolvedValue([conversation({ kind: "DIRECT" })]) });
    await expect(
      new ReportTargetResolver(makeMessagePort(), direct, access()).resolve(REPORTER, { targetType: "CONVERSATION", targetId: CONV_ID, reason: "SPAM" })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "MOD_003" });

    await expect(
      new ReportTargetResolver(makeMessagePort(), group, access(invisible)).resolve(REPORTER, { targetType: "CONVERSATION", targetId: CONV_ID, reason: "SPAM" })
    ).rejects.toMatchObject({ errorCode: "MOD_002" });
  });
});
