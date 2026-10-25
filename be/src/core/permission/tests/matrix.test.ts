/**
 * ACL-03 — Ma trận scope × vai trò × action (be.md §10), sinh test tự động
 * từ fixture `tests/fixtures/acl-matrix.json` chạy qua resolver giả.
 */
import fs from "fs";
import path from "path";
import { registerScopeResolver, clearScopeRegistry } from "../scope-registry";
import { permissionService } from "../permission.service";
import type { Action } from "../actions";
import type { ScopeType } from "../scope.types";
import {
  FakeWorkspaceResolver,
  FakeChannelResolver,
  FakeConversationResolver,
  FakeMeetingResolver,
  FakeCallResolver,
} from "./fixtures/fake-resolvers";
import { installFakeRedis, type FakeRedisMock } from "./fixtures/fake-redis";

jest.mock("../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("./fixtures/fake-redis");
  return createFakeRedisModule();
});

import { redis } from "../../../infrastructure/redis";

interface MatrixCase {
  scope: ScopeType;
  role: string;
  action: Action;
  expect: "allow" | "deny" | "404";
}

const matrix = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/acl-matrix.json"), "utf-8")
) as MatrixCase[];

const SCOPE_ID: Record<ScopeType, string> = {
  WORKSPACE: "ws1",
  CHANNEL: "ch1",
  CONVERSATION: "conv1",
  MEETING: "meet1",
  CALL: "call1",
  BOARD: "board1",
  DOCUMENT: "doc1",
  WHITEBOARD: "wb1",
  COMPANY: "comp1",
};

function userFor(role: string): { id: string; email: string } {
  const id = role.toLowerCase();
  return { id, email: `${id}@example.com` };
}

describe("ACL-03 — ma trận quyền (resolver giả)", () => {
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    clearScopeRegistry();

    const ws = new FakeWorkspaceResolver();
    ws.members.set(
      "ws1",
      new Map([
        ["owner", "OWNER"],
        ["admin", "ADMIN"],
        ["member", "MEMBER"],
        ["guest", "GUEST"],
        // "visitor" không xuất hiện trong ma trận WORKSPACE — chỉ để CHANNEL
        // PUBLIC nhận diện đúng "là thành viên workspace" cho case VISITOR.
        ["visitor", "MEMBER"],
      ])
    );
    registerScopeResolver(ws);

    const ch = new FakeChannelResolver();
    ch.channels.set("ch1", {
      workspaceId: "ws1",
      visibility: "PUBLIC",
      grants: new Map([
        ["manager", "MANAGER"],
        ["member", "MEMBER"],
      ]),
    });
    registerScopeResolver(ch);

    const conv = new FakeConversationResolver();
    conv.conversations.set("conv1", {
      kind: "GROUP",
      members: new Map([
        ["owner", "OWNER"],
        ["admin", "ADMIN"],
        ["member", "MEMBER"],
      ]),
    });
    registerScopeResolver(conv);

    const meet = new FakeMeetingResolver();
    meet.meetings.set("meet1", {
      workspaceId: "ws1",
      attendees: new Map([
        ["host", "HOST"],
        ["cohost", "COHOST"],
        ["attendee", "ATTENDEE"],
      ]),
    });
    registerScopeResolver(meet);

    const call = new FakeCallResolver();
    call.participants.set(
      "call1",
      new Map([
        ["host", "HOST"],
        ["participant", "PARTICIPANT"],
      ])
    );
    registerScopeResolver(call);
  });

  afterEach(() => {
    clearScopeRegistry();
  });

  for (const c of matrix) {
    it(`${c.scope} / ${c.role} / ${c.action} → ${c.expect}`, async () => {
      const user = userFor(c.role);
      const scope = { type: c.scope, id: SCOPE_ID[c.scope] };

      if (c.expect === "allow") {
        await expect(permissionService.can(user, c.action, scope)).resolves.toBe(true);
        await expect(permissionService.assert(user, c.action, scope)).resolves.toBeDefined();
      } else if (c.expect === "deny") {
        await expect(permissionService.can(user, c.action, scope)).resolves.toBe(false);
        await expect(permissionService.assert(user, c.action, scope)).rejects.toMatchObject({
          statusCode: 403,
        });
      } else {
        await expect(permissionService.can(user, c.action, scope)).resolves.toBe(false);
        await expect(permissionService.assert(user, c.action, scope)).rejects.toMatchObject({
          statusCode: 404,
        });
      }
    });
  }
});
