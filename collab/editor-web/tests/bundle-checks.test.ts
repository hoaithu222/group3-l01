import { describe, expect, it } from "vitest";
import { analyzeBundle, cspHash, FORBIDDEN_APIS, MAX_BUNDLE_BYTES, pinScriptCsp } from "../scripts/lib/bundle-checks.mjs";

const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">`;
const page = (script: string, extra = "") => `<!doctype html><html><head>${csp}<style>body{margin:0}</style></head><body>${extra}<script type="module">${script}</script></body></html>`;

describe("analyzeBundle", () => {
  it("bundle sạch: một script nội tuyến, có CSP, không tài nguyên ngoài", () => {
    const r = analyzeBundle(page("const a=1;"));
    expect(r.scripts).toHaveLength(1);
    expect(r.problems).toEqual([]);
    expect(r.forbidden).toEqual([]);
    expect(r.hasCsp).toBe(true);
  });

  it("chuỗi URL trong mã thư viện (đường dẫn tài liệu) không phải yêu cầu mạng", () => {
    expect(analyzeBundle(page('console.warn("xem https://tiptap.dev/api");')).problems).toEqual([]);
  });

  it.each([
    ["script ngoài", '<script src="https://cdn.example/x.js"></script>'],
    ["script ngoài tương đối", '<script type="module" src="./x.js"></script>'],
    ["link stylesheet", '<link rel="stylesheet" href="x.css">'],
    ["ảnh ngoài", '<img src="https://a.b/x.png">'],
    ["iframe ngoài", '<iframe src="//a.b/"></iframe>'],
  ])("phát hiện %s", (_name, extra) => {
    expect(analyzeBundle(page("1", extra)).problems.length).toBeGreaterThan(0);
  });

  it("phát hiện url() ngoài và @import trong CSS nội tuyến", () => {
    expect(analyzeBundle(`${csp}<style>a{background:url(https://a.b/x.png)}</style><script>1</script>`).problems.length).toBeGreaterThan(0);
    expect(analyzeBundle(`${csp}<style>@import url("https://a.b/x.css");</style><script>1</script>`).problems.length).toBeGreaterThan(0);
    expect(analyzeBundle(`${csp}<style>a{background:url(data:image/png;base64,AAAA)}</style><script>1</script>`).problems).toEqual([]);
  });

  it.each(FORBIDDEN_APIS)("chặn API %s", (api) => {
    expect(analyzeBundle(page(`x=${api}`)).forbidden).toEqual([api]);
  });

  it("thiếu CSP thì báo", () => {
    expect(analyzeBundle("<html><script>1</script></html>").hasCsp).toBe(false);
  });
});

describe("pinScriptCsp", () => {
  it("thay 'unsafe-inline' của script-src bằng hash sha256 (base64) của đúng nội dung script", () => {
    const script = 'const s="Tiếng Việt";';
    const { html, hashes } = pinScriptCsp(page(script));
    expect(hashes).toEqual([cspHash(script)]);
    expect(hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
    expect(html).toContain(`script-src ${hashes[0]};`);
    expect(html).toContain("style-src 'unsafe-inline'"); // style vẫn cần inline
    expect(html).not.toContain("script-src 'unsafe-inline'");
  });

  it("hash tính trên UTF-8 (khớp giá trị chuẩn)", () => {
    // sha256("") base64 = 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
    expect(cspHash("")).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
  });

  it("từ chối khi không có script, khi script có CR (hash sẽ lệch sau chuẩn hoá của trình duyệt), hoặc CSP thiếu chỗ thay", () => {
    expect(() => pinScriptCsp(`${csp}<p>không script</p>`)).toThrow("không có script");
    expect(() => pinScriptCsp(page("a\r\nb"))).toThrow("CR");
    expect(() => pinScriptCsp(page("1").replace("script-src 'unsafe-inline'", "script-src 'self'"))).toThrow("unsafe-inline");
  });

  it("trần kích thước 1,5 MB", () => {
    expect(MAX_BUNDLE_BYTES).toBe(1_500_000);
  });
});
