/**
 * Unit — `mention.parser.ts` (be.md §5.1, §10 "Unit parser"). Hàm thuần, không
 * cần Prisma/Redis: marker hợp lệ/không, id sai độ dài, nhiều marker cùng
 * target, `textForSearch`, `mentionKey`.
 */
import { parseMarkers, buildTextForSearch, mentionKey, type ParsedMarker } from "../mention.parser";

const ID_A = "507f1f77bcf86cd799439011";
const ID_B = "507f1f77bcf86cd799439012";

describe("mention.parser#parseMarkers()", () => {
  it("nội dung không có marker → mảng rỗng", () => {
    expect(parseMarkers("Xin chào cả nhà")).toEqual([]);
    expect(parseMarkers("")).toEqual([]);
  });

  it("@{u:<24 hex>} → USER kèm vị trí start/end đúng trong content gốc", () => {
    const content = `Chào @{u:${ID_A}} nhé`;
    const [marker, ...rest] = parseMarkers(content);
    expect(rest).toEqual([]);
    expect(marker).toEqual({ type: "USER", targetId: ID_A, start: 5, end: 5 + `@{u:${ID_A}}`.length });
    expect(content.slice(marker.start, marker.end)).toBe(`@{u:${ID_A}}`);
  });

  it("chấp nhận cả hex chữ HOA (regex [0-9a-fA-F])", () => {
    const upper = ID_A.toUpperCase();
    expect(parseMarkers(`@{u:${upper}}`)).toMatchObject([{ type: "USER", targetId: upper }]);
  });

  it("@{all} → ALL, targetId null", () => {
    const content = "Mọi người @{all} chú ý";
    expect(parseMarkers(content)).toMatchObject([
      { type: "ALL", targetId: null, start: content.indexOf("@{all}"), end: content.indexOf("@{all}") + 6 },
    ]);
  });

  it("@{r:ADMIN} / @{r:MEMBER} → ROLE (chỉ parse — P0 MentionService từ chối); vai trò lạ KHÔNG khớp", () => {
    expect(parseMarkers("@{r:ADMIN} và @{r:MEMBER}")).toMatchObject([
      { type: "ROLE", targetId: "ADMIN" },
      { type: "ROLE", targetId: "MEMBER" },
    ]);
    expect(parseMarkers("@{r:OWNER} @{r:admin}")).toEqual([]);
  });

  it("id sai độ dài / không hex / thiếu ngoặc → giữ như văn bản thường, KHÔNG lỗi (be.md §5.1)", () => {
    expect(parseMarkers("@{u:xyz}")).toEqual([]);
    expect(parseMarkers(`@{u:${ID_A.slice(0, 23)}}`)).toEqual([]); // 23 ký tự
    expect(parseMarkers(`@{u:${ID_A}0}`)).toEqual([]); // 25 ký tự
    expect(parseMarkers(`@{u:${"z".repeat(24)}}`)).toEqual([]); // không phải hex
    expect(parseMarkers(`@{u:${ID_A}`)).toEqual([]); // thiếu }
    expect(parseMarkers(`{u:${ID_A}}`)).toEqual([]); // thiếu @
    expect(parseMarkers("@{all")).toEqual([]);
  });

  it("nhiều marker CÙNG target → trả từng marker riêng (vị trí khác nhau); dedupe là việc của MentionService", () => {
    const markers = parseMarkers(`@{u:${ID_A}} và lại @{u:${ID_A}}`);
    expect(markers).toHaveLength(2);
    expect(markers[0].start).toBeLessThan(markers[1].start);
    expect(new Set(markers.map((m) => mentionKey(m.type, m.targetId))).size).toBe(1);
  });

  it("trộn USER + ALL + ROLE → sắp theo vị trí xuất hiện (start tăng dần), không theo loại", () => {
    const content = `@{all} rồi @{u:${ID_B}} rồi @{r:MEMBER} rồi @{u:${ID_A}}`;
    const markers = parseMarkers(content);
    expect(markers.map((m) => m.type)).toEqual(["ALL", "USER", "ROLE", "USER"]);
    expect(markers.map((m) => m.start)).toEqual([...markers.map((m) => m.start)].sort((a, b) => a - b));
  });

  it("2 marker sát nhau không dấu cách vẫn tách đúng", () => {
    const markers = parseMarkers(`@{u:${ID_A}}@{u:${ID_B}}`);
    expect(markers.map((m) => m.targetId)).toEqual([ID_A, ID_B]);
    expect(markers[0].end).toBe(markers[1].start);
  });
});

describe("mention.parser#buildTextForSearch()", () => {
  const labels: Record<string, string> = { [ID_A]: "Minh", [ID_B]: "Lan" };
  const labelFor = (m: ParsedMarker): string => (m.type === "ALL" ? "tất cả" : (labels[m.targetId ?? ""] ?? "?"));

  it("không marker → trả nguyên văn", () => {
    expect(buildTextForSearch("Không có gì", [], labelFor)).toBe("Không có gì");
  });

  it("thay từng marker bằng @label (dùng cho normalizedContent tìm theo tên lúc gửi)", () => {
    const content = `Chào @{u:${ID_A}} và @{u:${ID_B}}, @{all} nghe nhé`;
    expect(buildTextForSearch(content, parseMarkers(content), labelFor)).toBe("Chào @Minh và @Lan, @tất cả nghe nhé");
  });

  it("label khác độ dài marker gốc không làm lệch vị trí các marker còn lại (thay từ CUỐI lên đầu)", () => {
    const content = `@{u:${ID_A}}@{u:${ID_B}}@{all}`;
    expect(buildTextForSearch(content, parseMarkers(content), labelFor)).toBe("@Minh@Lan@tất cả");
  });

  it("marker trùng target vẫn được thay đủ cả hai lần", () => {
    const content = `@{u:${ID_A}} và @{u:${ID_A}}`;
    expect(buildTextForSearch(content, parseMarkers(content), labelFor)).toBe("@Minh và @Minh");
  });

  it("không đổi thứ tự/đột biến mảng markers truyền vào", () => {
    const content = `a @{u:${ID_A}} b @{u:${ID_B}}`;
    const markers = parseMarkers(content);
    const snapshot = markers.map((m) => ({ ...m }));
    buildTextForSearch(content, markers, labelFor);
    expect(markers).toEqual(snapshot);
  });
});

describe("mention.parser#mentionKey()", () => {
  it("khoá (type, targetId) — ALL/null dùng chuỗi rỗng; USER/ROLE khác loại không đụng nhau", () => {
    expect(mentionKey("USER", ID_A)).toBe(`USER:${ID_A}`);
    expect(mentionKey("ALL", null)).toBe("ALL:");
    expect(mentionKey("ROLE", "ADMIN")).toBe("ROLE:ADMIN");
    expect(mentionKey("USER", ID_A)).not.toBe(mentionKey("ROLE", ID_A));
  });
});
