import { sealCredentials, sha256Hex } from "../services/credential.vault";
import { IntegrationConnectService } from "../services/integration-connect.service";
import { IntegrationService } from "../services/integration.service";
import { UserIntegrationService } from "../services/user-integration.service";
import { ADMIN, CHANNEL, FakeGoogleProvider, FakeOAuthProvider, MEMBER, OWNER, WS, makeHarness, type Harness } from "./support/integration-harness";

const user = (id: string) => ({ id, email: `${id}@e.com` });
const stateOf = (url: string): string => new URL(url).searchParams.get("state") ?? "";
const paramsOf = (redirect: string): URLSearchParams => new URL(redirect.replace("superapp://", "https://app.local/")).searchParams;

let h: Harness;
let provider: FakeOAuthProvider;
let connect: IntegrationConnectService;

function setup(stateTtlSeconds?: number): void {
  provider = new FakeOAuthProvider("GITHUB");
  h = makeHarness([provider, new FakeGoogleProvider()], { stateTtlSeconds });
  connect = new IntegrationConnectService(h.deps);
}

beforeEach(() => setup());

describe("INT-05 — state OAuth dùng một lần", () => {
  it("kết nối thành công rồi dùng lại state → status=error&code=INT_003, không tạo kết nối thứ hai", async () => {
    const { authorizeUrl } = await connect.connect(user(ADMIN), WS, "github", "app");
    const state = stateOf(authorizeUrl);
    expect(state.length).toBeGreaterThanOrEqual(32);

    const ok = paramsOf(await connect.handleCallback("github", { state, code: "c1", installation_id: "4242" }));
    expect(ok.get("status")).toBe("ok");
    expect(ok.get("workspaceId")).toBe(WS);
    expect(h.integrations.rows.size).toBe(1);
    const [created] = [...h.integrations.rows.values()];
    expect(created).toMatchObject({ targetScopeId: CHANNEL, createdBy: ADMIN, status: "ACTIVE" });
    expect(h.audits.map((a) => a.action)).toContain("integration.connect");

    const again = paramsOf(await connect.handleCallback("github", { state, code: "c2", installation_id: "4242" }));
    expect(again.get("status")).toBe("error");
    expect(again.get("code")).toBe("INT_003");
    expect(provider.exchanges).toHaveLength(1);
    expect(h.integrations.rows.size).toBe(1);
  });

  it("state hết hạn / lạ / sai nhà cung cấp → INT_003, không gọi nhà cung cấp", async () => {
    setup(0);
    const { authorizeUrl } = await connect.connect(user(ADMIN), WS, "github", "app");
    const expired = paramsOf(await connect.handleCallback("github", { state: stateOf(authorizeUrl), code: "c" }));
    expect(expired.get("code")).toBe("INT_003");

    setup();
    const bogus = paramsOf(await connect.handleCallback("github", { state: "x".repeat(43), code: "c" }));
    expect(bogus.get("code")).toBe("INT_003");
    const { authorizeUrl: gh } = await connect.connect(user(ADMIN), WS, "github", "app");
    const cross = paramsOf(await connect.handleCallback("figma", { state: stateOf(gh), code: "c" }));
    expect(cross.get("code")).toBe("INT_003");
    expect(provider.exchanges).toHaveLength(0);
    expect(h.integrations.rows.size).toBe(0);
  });

  it("tài khoản ngoài đã nối nhóm khác → INT_008", async () => {
    await h.integrations.upsert({
      workspaceId: "650000000000000000000099",
      provider: "GITHUB",
      externalAccountId: "4242",
      externalName: "vci-org",
      credentials: null,
      tokenExpiresAt: null,
      scopes: [],
      config: { repos: [], events: [] },
      targetScopeType: "CHANNEL",
      targetScopeId: CHANNEL,
      webhookSecretHash: null,
      createdBy: OWNER,
    });
    const { authorizeUrl } = await connect.connect(user(ADMIN), WS, "github", "app");
    const res = paramsOf(await connect.handleCallback("github", { state: stateOf(authorizeUrl), code: "c", installation_id: "4242" }));
    expect(res.get("code")).toBe("INT_008");
    expect(h.integrations.rows.size).toBe(1);
  });

  it("nhà cung cấp chưa cấu hình/bị tắt → INT_001 ngay khi bắt đầu", async () => {
    provider.configured = false;
    await expect(connect.connect(user(ADMIN), WS, "github", "app")).rejects.toMatchObject({ errorCode: "INT_001" });
    provider.configured = true;
    h.flags.providers.github = false;
    await expect(connect.connect(user(ADMIN), WS, "github", "app")).rejects.toMatchObject({ errorCode: "INT_001" });
  });
});

describe("INT-08 — API không trả token/secret", () => {
  it("chi tiết, danh sách (ADMIN/MEMBER) và kết nối cá nhân không chứa credentials", async () => {
    const secret = "gho_SuperSecretAccessToken123456789";
    const { entity } = await h.integrations.upsert({
      workspaceId: WS,
      provider: "GITLAB",
      externalAccountId: "55",
      externalName: "vci-gl",
      credentials: sealCredentials({ accessToken: secret, refreshToken: "glrt-refresh-secret", webhookSecret: "hook-secret-value" }),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      scopes: ["api"],
      config: { repos: [{ id: "12", fullName: "vci/gl" }], events: ["push"] },
      targetScopeType: "CHANNEL",
      targetScopeId: CHANNEL,
      webhookSecretHash: sha256Hex("hook-secret-value"),
      createdBy: ADMIN,
    });
    const service = new IntegrationService(h.deps);
    const outputs: unknown[] = [
      await service.get(user(ADMIN), entity.id),
      await service.listForWorkspace(user(OWNER), WS),
      await service.listForWorkspace(user(MEMBER), WS),
    ];
    const google = new UserIntegrationService(h.deps, { backfillUpcoming: () => Promise.resolve(0) });
    await h.userIntegrations.upsert({ userId: MEMBER, provider: "GOOGLE_CALENDAR", externalAccountId: "m@gmail.com", credentials: sealCredentials({ accessToken: "ya29.secret", refreshToken: "1//refresh" }), tokenExpiresAt: null });
    outputs.push(await google.list(user(MEMBER)));
    for (const out of outputs) {
      const json = JSON.stringify(out);
      for (const forbidden of ["ciphertext", "credentials", "webhookSecretHash", "externalHookIds", secret, "glrt-refresh-secret", "hook-secret-value", "ya29.secret", "1//refresh"]) {
        expect(json).not.toContain(forbidden);
      }
    }
    const memberView = outputs[2] as { canManage: boolean; items: Array<Record<string, unknown>> };
    expect(memberView.canManage).toBe(false);
    expect(Object.keys(memberView.items[0] ?? {}).sort()).toEqual(["externalName", "id", "provider", "providerKey", "target"]);
  });
});
