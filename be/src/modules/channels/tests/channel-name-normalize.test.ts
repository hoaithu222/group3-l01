/**
 * Unit — chuẩn hoá tên kênh dùng bởi `channel.service.ts#create()/patch()`
 * (`normalizedName = normalizeSearch(name)`, `@@unique([workspaceId,
 * normalizedName])` be.md §2/§3) và `searchNames()`. `normalizeSearch()` đã có
 * test chung ở `core/utils/tests/normalize.test.ts` — file này chỉ khẳng định
 * lại đúng 2 cặp tên kênh nêu trong be.md §10/README §10 sẽ VA CHẠM nhau
 * (cùng `normalizedName` → CH_001), vì đây là hành vi nghiệp vụ CHANNELS thật
 * sự dựa vào (không phải chi tiết cài đặt của `core/utils`).
 */
import { normalizeSearch } from "../../../core/utils/normalize";

describe("chuẩn hoá tên kênh (be.md §10 — CH_001 dedup)", () => {
  it('"Frontend  " (khoảng trắng thừa) ≡ "frontend"', () => {
    expect(normalizeSearch("Frontend  ")).toBe(normalizeSearch("frontend"));
    expect(normalizeSearch("Frontend  ")).toBe("frontend");
  });

  it('"Đồ án" ≡ "Do an" (bỏ dấu + hạ thường)', () => {
    expect(normalizeSearch("Đồ án")).toBe(normalizeSearch("Do an"));
    expect(normalizeSearch("Đồ án")).toBe("do an");
  });

  it("2 tên hiển thị khác nhau nhưng normalizedName trùng → cùng 1 khoá unique workspace+normalizedName", () => {
    const workspaceId = "ws1";
    const candidates = ["Frontend  ", "frontend", "FRONTEND"];
    const keys = candidates.map((name) => `${workspaceId}:${normalizeSearch(name)}`);
    expect(new Set(keys).size).toBe(1);
  });

  it("tên khác nghĩa (không chỉ khác dấu/hoa-thường) → normalizedName KHÁC nhau", () => {
    expect(normalizeSearch("Frontend")).not.toBe(normalizeSearch("Backend"));
  });
});
