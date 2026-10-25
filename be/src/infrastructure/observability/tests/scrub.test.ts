import { FILTERED, scrubBreadcrumb, scrubEvent, scrubQueryString, scrubUrl, scrubValue } from "../scrub";

/** OPS-01 (p0-11): sự kiện gửi lên Sentry KHÔNG mang header auth/cookie, mật khẩu, token, nội dung tin, payload webhook. */
describe("scrubEvent", () => {
  it("che header authorization/cookie/x-api-key, giữ header vô hại (content-type, x-request-id)", () => {
    const event = scrubEvent({
      request: {
        url: "https://api.example.com/api/v1/auth/login",
        cookies: { refresh_token: "abc" },
        headers: {
          Authorization: "Bearer eyJhbGciOi.secret",
          Cookie: "refresh_token=abc",
          "X-Api-Key": "k",
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
      },
    });
    expect(event.request?.headers).toEqual({
      Authorization: FILTERED,
      Cookie: FILTERED,
      "X-Api-Key": FILTERED,
      "content-type": "application/json",
      "x-request-id": "req-1",
    });
    expect(event.request).not.toHaveProperty("cookies");
  });

  it("che body: password/newPassword/token/refreshToken/content (kể cả lồng nhau và trong mảng), giữ trường khác", () => {
    const event = scrubEvent({
      request: {
        url: "/api/v1/messages",
        data: {
          email: "a@b.c",
          password: "hunter2",
          newPassword: "hunter3",
          token: "t",
          refreshToken: "r",
          content: "nội dung tin nhắn riêng tư",
          nested: { deviceToken: "d", note: "ok", items: [{ htmlContent: "<b>x</b>", id: 7 }] },
        },
      },
    });
    expect(event.request?.data).toEqual({
      email: "a@b.c",
      password: FILTERED,
      newPassword: FILTERED,
      token: FILTERED,
      refreshToken: FILTERED,
      content: FILTERED,
      nested: { deviceToken: FILTERED, note: "ok", items: [{ htmlContent: FILTERED, id: 7 }] },
    });
  });

  it("body của request tới /webhooks/* bị bỏ hẳn (payload nhà cung cấp)", () => {
    const event = scrubEvent({ request: { url: "https://x.test/api/v1/webhooks/livekit", data: { event: "participant_joined", participant: { name: "An" } } } });
    expect(event.request?.data).toBe(FILTERED);
  });

  it("query string: che token và từ khoá tìm kiếm q, giữ tham số khác; áp dụng cho cả url lẫn query_string", () => {
    const event = scrubEvent({
      request: { url: "/api/v1/workspaces/1/search?q=luong+giam+doc&limit=20&token=abc", query_string: "q=bi-mat&page=2&access_token=zzz" },
    });
    expect(event.request?.url).toBe(`/api/v1/workspaces/1/search?q=${encodeURIComponent(FILTERED)}&limit=20&token=${encodeURIComponent(FILTERED)}`);
    expect(event.request?.query_string).toBe(`q=${encodeURIComponent(FILTERED)}&page=2&access_token=${encodeURIComponent(FILTERED)}`);
  });

  it("user chỉ giữ id (không email/IP/username)", () => {
    const event = scrubEvent({ user: { id: "u1", email: "a@b.c", ip_address: "1.2.3.4", username: "an" } });
    expect(event.user).toEqual({ id: "u1" });
    expect(scrubEvent({ user: { email: "a@b.c" } }).user).toEqual({});
  });

  it("extra/contexts được lọc đệ quy", () => {
    const event = scrubEvent({ extra: { authorization: "Bearer x", ok: 1 }, contexts: { job: { apiKey: "k", queue: "push" } } });
    expect(event.extra).toEqual({ authorization: FILTERED, ok: 1 });
    expect(event.contexts).toEqual({ job: { apiKey: FILTERED, queue: "push" } });
  });

  it("breadcrumb và span HTTP trong sự kiện cũng được lọc", () => {
    const event = scrubEvent({
      breadcrumbs: [{ category: "http", data: { url: "https://fcm.test/send?token=abc&x=1", method: "POST", body: "{...}" } }],
      spans: [{ description: "GET https://x.test/a?token=1", data: { "http.url": "https://x.test/a?q=riêng", "http.request.header.authorization": "Bearer x", status: 200 } }],
    });
    expect(event.breadcrumbs?.[0].data).toEqual({ url: `https://fcm.test/send?token=${encodeURIComponent(FILTERED)}&x=1`, method: "POST" });
    expect(event.spans?.[0].data).toEqual({
      "http.url": `https://x.test/a?q=${encodeURIComponent(FILTERED)}`,
      "http.request.header.authorization": FILTERED,
      status: 200,
    });
  });

  it("không bao giờ ném lỗi và không rò dữ liệu khi cấu trúc bất thường", () => {
    const hostile = { request: {} } as { request: Record<string, unknown> };
    Object.defineProperty(hostile.request, "headers", {
      enumerable: true,
      get() {
        throw new Error("getter độc");
      },
    });
    expect(() => scrubEvent(hostile)).not.toThrow();
    expect(scrubEvent(hostile)).not.toHaveProperty("request.headers");
  });
});

describe("scrubValue / scrubBreadcrumb / scrubUrl", () => {
  it("giữ nguyên số/boolean/null dù tên khoá 'nhạy cảm' (hasToken, code: 500)", () => {
    expect(scrubValue({ hasToken: true, token: null, code: 500, tokenCount: 3 })).toEqual({ hasToken: true, token: null, code: 500, tokenCount: 3 });
  });

  it("chặn vòng tham chiếu và lồng quá sâu", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(scrubValue(a)).toEqual({ name: "a", self: "[Circular]" });
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 12; i++) deep = { deep };
    expect(JSON.stringify(scrubValue(deep))).toContain("[Truncated]");
  });

  it("không đụng vào đối tượng gốc", () => {
    const original = { password: "p", nested: { token: "t" } };
    scrubValue(original);
    expect(original).toEqual({ password: "p", nested: { token: "t" } });
  });

  it("scrubBreadcrumb bỏ body và lọc query; breadcrumb không có data giữ nguyên", () => {
    const b = scrubBreadcrumb({ category: "http", data: { url: "/x?code=abc&y=1", request_body: "a", response_body: "b", status_code: 200 } });
    expect(b.data).toEqual({ url: `/x?code=${encodeURIComponent(FILTERED)}&y=1`, status_code: 200 });
    const plain = { category: "ui.click", message: "nút" };
    expect(scrubBreadcrumb(plain)).toBe(plain);
  });

  it("scrubUrl/scrubQueryString: khoá mã hoá URL, không có query, có #fragment", () => {
    expect(scrubUrl("/a/b")).toBe("/a/b");
    expect(scrubUrl("/a?x=1#frag")).toBe("/a?x=1");
    expect(scrubQueryString("%74oken=abc&ok=1")).toBe(`%74oken=${encodeURIComponent(FILTERED)}&ok=1`);
    expect(scrubQueryString("flag&q=z")).toBe(`flag&q=${encodeURIComponent(FILTERED)}`);
  });
});
