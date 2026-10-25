import { mapGithubEvent } from "../providers/event-mappers/github.mapper";
import { FigmaProvider } from "../providers/figma.provider";
import { GitlabProvider } from "../providers/gitlab.provider";
import { GoogleCalendarProvider, calendarEventId, type CalendarEventInput } from "../providers/google-calendar.provider";
import { ProviderHttp, assertAllowedUrl, type FetchLike } from "../providers/provider-http";
import { ProviderUnavailableError } from "../providers/provider.interface";
import { redactPayload } from "../providers/payload-redactor";
import { sha256Hex } from "../services/credential.vault";
import { pushPayload } from "./support/integration-harness";

const noNetwork: FetchLike = () => Promise.reject(new Error("không gọi mạng"));

describe("mapper GitHub", () => {
  it("push 7 commit → tiêu đề nêu tổng số, chỉ hiện 5 commit (sha7 + dòng đầu), không email", () => {
    const msg = mapGithubEvent("push", pushPayload(7));
    expect(msg).toMatchObject({ provider: "GITHUB", event: "push", repo: "vci/app", ref: "main", commitCount: 7 });
    expect(msg?.commits).toHaveLength(5);
    expect(msg?.commits?.[0]).toEqual({ sha7: "abcdef0", message: "Sửa lỗi 1" });
    expect(msg?.title).toContain("7");
    expect(JSON.stringify(msg)).not.toContain("@");
  });

  it("PR merged / issue opened / release published; hành động không hỗ trợ → null", () => {
    const repo = { id: 1001, full_name: "vci/app" };
    const pr = mapGithubEvent("pull_request", { action: "closed", repository: repo, sender: { login: "a" }, pull_request: { number: 12, title: "Thêm X", merged: true, html_url: "https://github.com/vci/app/pull/12" } });
    expect(pr).toMatchObject({ event: "pull_request", action: "merged", number: 12, url: "https://github.com/vci/app/pull/12" });
    const issue = mapGithubEvent("issues", { action: "opened", repository: repo, sender: { login: "a" }, issue: { number: 3, title: "Lỗi Y", html_url: "https://github.com/vci/app/issues/3" } });
    expect(issue).toMatchObject({ event: "issues", action: "opened", number: 3 });
    const release = mapGithubEvent("release", { action: "published", repository: repo, sender: { login: "a" }, release: { tag_name: "v1.0.0", name: "Bản 1", html_url: "https://github.com/vci/app/releases/tag/v1.0.0" } });
    expect(release).toMatchObject({ event: "release", action: "published" });
    expect(mapGithubEvent("issues", { action: "labeled", repository: repo, issue: { number: 3, title: "t" } })).toBeNull();
  });

  it("liên kết ngoài domain GitHub bị bỏ (không đưa link lạ vào kênh)", () => {
    const pr = mapGithubEvent("pull_request", { action: "opened", repository: { id: 1, full_name: "a/b" }, sender: { login: "a" }, pull_request: { number: 1, title: "t", html_url: "https://evil.example/phish" } });
    expect(pr?.url).toBeUndefined();
  });
});

describe("GitLab / Figma — secret riêng từng kết nối, so sánh hằng thời gian", () => {
  const found = (secret: string) => ({ findBySecretHash: (hash: string) => Promise.resolve(hash === sha256Hex(secret) ? { id: "int_9", webhookSecretHash: hash } : null) });

  it("GitLab X-Gitlab-Token đúng → ok + id kết nối; sai/thiếu → từ chối", async () => {
    const gl = new GitlabProvider(new ProviderHttp(["gitlab.com"], { fetchImpl: noNetwork }));
    const body = Buffer.from(JSON.stringify({ object_kind: "push", project: { id: 12, path_with_namespace: "vci/gl" }, ref: "refs/heads/main", commits: [] }));
    await expect(gl.verifyWebhook(body, { "x-gitlab-token": "s3cret-gl" }, found("s3cret-gl"))).resolves.toEqual({ ok: true, integrationId: "int_9" });
    await expect(gl.verifyWebhook(body, { "x-gitlab-token": "khac" }, found("s3cret-gl"))).resolves.toEqual({ ok: false });
    await expect(gl.verifyWebhook(body, {}, found("s3cret-gl"))).resolves.toEqual({ ok: false });
    expect(gl.parseWebhook(body, { "x-gitlab-event-uuid": "uuid-1" })).toMatchObject({ eventId: "uuid-1", eventType: "push", resourceId: "12" });
  });

  it("Figma passcode trong body đúng → ok; payload lưu KHÔNG còn passcode; map FILE_COMMENT", async () => {
    const fg = new FigmaProvider(new ProviderHttp(["api.figma.com"], { fetchImpl: noNetwork }));
    const body = Buffer.from(JSON.stringify({ event_type: "FILE_COMMENT", passcode: "pc-123", file_key: "AbCdEf123456", file_name: "UI Kit", triggered_by: { handle: "mai" }, comment: [{ text: "Sửa màu nút" }] }));
    await expect(fg.verifyWebhook(body, {}, found("pc-123"))).resolves.toMatchObject({ ok: true });
    await expect(fg.verifyWebhook(body, {}, found("khac"))).resolves.toEqual({ ok: false });
    const parsed = fg.parseWebhook(body);
    expect(JSON.stringify(parsed?.payload)).not.toContain("pc-123");
    expect(fg.mapEvent("FILE_COMMENT", parsed!.payload)).toMatchObject({ provider: "FIGMA", action: "commented", url: "https://www.figma.com/file/AbCdEf123456" });
  });
});

describe("Google Calendar provider (fetch giả)", () => {
  const input: CalendarEventInput = { meetingId: "m1", userId: "u1", title: "Họp", description: "d", startAt: new Date("2026-10-01T02:00:00Z"), endAt: new Date("2026-10-01T03:00:00Z"), timezone: "Asia/Ho_Chi_Minh", url: "https://web.test/m/x" };
  const tokens = { accessToken: "at" };

  function provider(responses: Array<[number, unknown]>): { g: GoogleCalendarProvider; calls: Array<{ url: string; method?: string; ifMatch?: string }> } {
    const calls: Array<{ url: string; method?: string; ifMatch?: string }> = [];
    const fetchImpl: FetchLike = (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: init?.method, ifMatch: headers["If-Match"] });
      const [status, body] = responses.shift() ?? [500, {}];
      return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }));
    };
    return { g: new GoogleCalendarProvider(new ProviderHttp(["www.googleapis.com", "oauth2.googleapis.com", "accounts.google.com"], { fetchImpl }), () => ({ clientId: "cid", clientSecret: "cs" })), calls };
  }

  it("tạo mới dùng id tất định; trùng id (409) → cập nhật, không tạo sự kiện thứ hai", async () => {
    const { g, calls } = provider([[409, {}], [200, { id: calendarEventId("m1", "u1"), etag: '"2"' }]]);
    await expect(g.upsertEvent(tokens, "primary", input, null)).resolves.toEqual({ externalEventId: calendarEventId("m1", "u1"), etag: '"2"' });
    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(calendarEventId("m1", "u1")).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it("etag lệch (412) → ghi đè không If-Match; sự kiện đã bị xoá (404) → chèn lại", async () => {
    const a = provider([[412, {}], [200, { id: "e1", etag: '"3"' }]]);
    await a.g.upsertEvent(tokens, "primary", input, { externalEventId: "e1", etag: '"1"' });
    expect(a.calls.map((c) => c.ifMatch)).toEqual(['"1"', undefined]);
    const b = provider([[404, {}], [200, { id: "e1", etag: '"4"' }]]);
    await b.g.upsertEvent(tokens, "primary", input, { externalEventId: "e1", etag: null });
    expect(b.calls.map((c) => c.method)).toEqual(["PATCH", "POST"]);
  });

  it("xoá: 404/410 coi như xong; 5xx → lỗi tạm thời (job thử lại)", async () => {
    await expect(provider([[410, {}]]).g.deleteEvent(tokens, "primary", "e1")).resolves.toBeUndefined();
    await expect(provider([[503, {}]]).g.deleteEvent(tokens, "primary", "e1")).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("lớp HTTP — chống SSRF + timeout", () => {
  it("chỉ https + host trong allowlist, không nhúng tài khoản", () => {
    expect(() => assertAllowedUrl("https://169.254.169.254/latest", ["api.github.com"])).toThrow();
    expect(() => assertAllowedUrl("http://api.github.com/x", ["api.github.com"])).toThrow();
    expect(() => assertAllowedUrl("https://u:p@api.github.com/x", ["api.github.com"])).toThrow();
    expect(assertAllowedUrl("https://api.github.com/x", ["api.github.com"]).hostname).toBe("api.github.com");
  });

  it("nhà cung cấp treo → ProviderUnavailableError sau timeout", async () => {
    const hang: FetchLike = (_url, init) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const http = new ProviderHttp(["api.github.com"], { fetchImpl: hang, timeoutMs: 20 });
    await expect(http.send("https://api.github.com/x")).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("payload hiển thị cho admin che token/email/secret", () => {
    const shown = JSON.stringify(redactPayload({ token: "abc", note: "gửi ghp_abcdefghijklmnopqrstuvwxyz0123 tới a@b.vn", nested: { client_secret: "x" } }, "display"));
    expect(shown).not.toMatch(/ghp_|a@b\.vn|"abc"|"x"/);
  });
});
