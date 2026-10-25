import { redactSearchQuery } from "../request-logger";

describe("redactSearchQuery", () => {
  it("che giá trị q (từ khoá tìm kiếm), giữ các tham số khác", () => {
    expect(redactSearchQuery("/api/v1/workspaces/abc/search?q=b%C3%A1o%20c%C3%A1o&type=messages&limit=30")).toBe(
      "/api/v1/workspaces/abc/search?q=[redacted]&type=messages&limit=30"
    );
    expect(redactSearchQuery("/api/v1/x/search?type=files&q=mat-khau")).toBe("/api/v1/x/search?type=files&q=[redacted]");
  });

  it("không đụng tham số chỉ chứa 'q' ở giữa tên và URL không có query", () => {
    expect(redactSearchQuery("/api/v1/x?faq=1&sq=2")).toBe("/api/v1/x?faq=1&sq=2");
    expect(redactSearchQuery("/api/v1/health")).toBe("/api/v1/health");
  });
});
