import { isBlankRecap, recapExcerpt, truncateGraphemes } from "../services/recap-content";

describe("recap-content — trích đoạn biên bản (markdown-lite) cho thẻ trong nhóm chat", () => {
  it("bỏ ký hiệu markdown-lite (tiêu đề, đậm/nghiêng, danh sách, việc cần làm, số thứ tự), bỏ dòng trống, lấy tối đa 4 dòng", () => {
    const md = "### Mục tiêu\n\n**Chốt** kế hoạch _quý 4_\n- Ra mắt tháng 10\n- [ ] Giao việc cho Thu\n- [x] Đã duyệt ngân sách\n1. Mục cuối";
    expect(recapExcerpt(md)).toBe("Mục tiêu\nChốt kế hoạch quý 4\nRa mắt tháng 10\nGiao việc cho Thu");
    expect(recapExcerpt(md, 280, 6)).toBe("Mục tiêu\nChốt kế hoạch quý 4\nRa mắt tháng 10\nGiao việc cho Thu\nĐã duyệt ngân sách\nMục cuối");
    expect(recapExcerpt("> trích dẫn\r\n+ dòng cộng")).toBe("trích dẫn\ndòng cộng");
  });

  it("cắt theo GRAPHEME (emoji ghép không bị chẻ đôi) và thêm dấu ba chấm khi bị cắt", () => {
    const family = "👨‍👩‍👧";
    expect(truncateGraphemes(family.repeat(5), 3)).toBe(`${family.repeat(3)}…`);
    expect(truncateGraphemes("ngắn", 10)).toBe("ngắn");
    const long = recapExcerpt("a".repeat(500));
    expect(Array.from(new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(long))).toHaveLength(281); // 280 + dấu ba chấm
    expect(long.endsWith("…")).toBe(true);
  });

  it("nội dung rỗng/chỉ khoảng trắng là trống (không công bố được)", () => {
    expect(isBlankRecap("")).toBe(true);
    expect(isBlankRecap(" \n\t  \r\n")).toBe(true);
    expect(isBlankRecap("a")).toBe(false);
    expect(recapExcerpt("  \n  ")).toBe("");
  });
});
