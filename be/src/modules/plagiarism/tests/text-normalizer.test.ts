import { removeBoilerplatePhrases } from "../lib/normalize/boilerplate";
import { stripRepeatedPageLines } from "../lib/normalize/page-lines";
import { foldWord, normalizeText, tokenizeText } from "../lib/normalize/text-normalizer";

const values = (text: string): string[] => tokenizeText(text).map((t) => t.value);

describe("tokenizeText / normalizeText", () => {
  it("PLAG-11: bản có dấu, bản bỏ dấu và bản đổi hoa/thường cho cùng dãy token", () => {
    const withMarks = "Trường Đại học Bách Khoa Hà Nội tổ chức hội thảo về Trí tuệ nhân tạo";
    const stripped = "Truong Dai hoc Bach Khoa Ha Noi to chuc hoi thao ve Tri tue nhan tao";
    const shouted = withMarks.toUpperCase();
    expect(values(stripped)).toEqual(values(withMarks));
    expect(values(shouted)).toEqual(values(withMarks));
    expect(normalizeText(withMarks)).toBe("truong dai hoc bach khoa ha noi to chuc hoi thao ve tri tue nhan tao");
  });

  it("đ/Đ → d và mọi thanh điệu/dấu mũ/móc bị bỏ", () => {
    expect(normalizeText("Đường đi ĐẾN nơi ấy, ước mơ ở đâu?")).toBe("duong di den noi ay uoc mo o dau");
    expect(foldWord("Nguyễn")).toBe("nguyen");
  });

  it("Unicode tổ hợp (NFD) và dựng sẵn (NFC) cho cùng token; offset trỏ đúng vào chuỗi NGUYÊN TRẠNG", () => {
    const nfc = "Việt Nam, đất nước Việt";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(values(nfd)).toEqual(values(nfc));
    const tokens = tokenizeText(nfd);
    // Token đầu là "Việt" ở dạng NFD (dài hơn 4 đơn vị vì dấu rời), phải cắt đúng nguyên từ, không thừa không thiếu dấu.
    expect(nfd.slice(tokens[0].start, tokens[0].end)).toBe("Việt".normalize("NFD"));
    expect(nfd.slice(tokens[4].start, tokens[4].end).normalize("NFC")).toBe("Việt");
    expect(tokens[4].value).toBe("viet");
  });

  it("offset [start, end) cắt đúng từ gốc, tăng dần, không chồng nhau", () => {
    const text = "  Xin chào,\tthế giới!\nDòng   hai: 3,14 (ok)  ";
    const tokens = tokenizeText(text);
    expect(tokens.map((t) => text.slice(t.start, t.end))).toEqual(["Xin", "chào", "thế", "giới", "Dòng", "hai", "3", "14", "ok"]);
    tokens.forEach((t, i) => {
      expect(t.start).toBeLessThan(t.end);
      if (i > 0) expect(t.start).toBeGreaterThanOrEqual(tokens[i - 1].end);
    });
  });

  it("dấu câu, khoảng trắng, xuống dòng, tab không ảnh hưởng; số được giữ; dấu nháy/gạch nối tách từ", () => {
    expect(values("Hello,   world!!\n\tfoo...bar")).toEqual(["hello", "world", "foo", "bar"]);
    expect(values("don't well-known 2024")).toEqual(["don", "t", "well", "known", "2024"]);
    expect(normalizeText("a.b;c:d")).toBe(normalizeText("a b c d"));
  });

  it("đầu vào rỗng / chỉ khoảng trắng / chỉ dấu câu / chỉ emoji → không token, không ném lỗi", () => {
    for (const s of ["", "   \n\t ", "!!! ??? ...", "😀😀🎓", "\u{0301}\u{0302}"]) expect(tokenizeText(s)).toEqual([]);
    expect(normalizeText("")).toBe("");
  });

  it("gập tương thích: ligature và full-width (PDF hay sinh ra) khớp bản thường; offset vẫn theo chuỗi gốc", () => {
    expect(values("ﬁnal ｆｕｌｌ ＡＢＣ")).toEqual(["final", "full", "abc"]);
    const t = tokenizeText("ﬁnal");
    expect([t[0].start, t[0].end]).toEqual([0, 4]);
  });

  it("chữ İ (I chấm) của tiếng Thổ Nhĩ Kỳ về i thường, không sinh dấu tổ hợp sót lại", () => {
    expect(values("İSTANBUL")).toEqual(["istanbul"]);
  });

  it("tất định và chịu được văn bản lớn (300k ký tự)", () => {
    const big = "Xin chào các bạn sinh viên, hôm nay ta học về đạo văn. ".repeat(5_500);
    const a = tokenizeText(big);
    expect(a.length).toBe(5_500 * 13);
    expect(tokenizeText(big)).toEqual(a);
  });
});

describe("stripRepeatedPageLines", () => {
  const page = (n: number, body: string[]): string => ["ĐẠI HỌC BÁCH KHOA — BÁO CÁO ĐỒ ÁN", ...body, `Trang ${n}/4`].join("\n");

  // Thân bài cố ý KHÔNG chứa chữ số: khoá so sánh đổi mọi số thành "#" để bắt số trang chạy, nên hai dòng chỉ khác nhau ở số là "lặp".
  const NAMES = ["alpha", "beta", "gamma", "delta"];

  it("bỏ header/footer lặp (số trang chạy vẫn nhận ra), giữ nguyên thân bài", () => {
    const pages = NAMES.map((name, i) => page(i + 1, [`Nội dung riêng ${name}.`, `Ý chính ${name} nhấn mạnh vấn đề.`]));
    const out = stripRepeatedPageLines(pages);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe("Nội dung riêng alpha.\nÝ chính alpha nhấn mạnh vấn đề.");
    out.forEach((p) => {
      expect(p).not.toMatch(/ĐẠI HỌC|Trang \d/);
    });
  });

  it("dòng ở THÂN bài lặp lại nhiều trang không bị xoá nhầm (chỉ xét mép trang)", () => {
    const filler = (name: string): string[] => Array.from({ length: 8 }, (_, i) => `dòng ${name}${String.fromCharCode(97 + i)}`);
    const pages = NAMES.slice(0, 3).map((name) => {
      const body = filler(name);
      body[4] = "Xem thêm ở mục trước";
      return body.join("\n");
    });
    expect(stripRepeatedPageLines(pages)).toEqual(pages);
  });

  it("dưới ngưỡng tỉ lệ trang thì giữ: header chỉ ở 1/4 trang", () => {
    const pages = [page(1, ["a"]), "b\nc\nd\ne\nf\ng", "h\ni\nj\nk\nl\nm", "n\no\np\nq\nr\ns"];
    expect(stripRepeatedPageLines(pages)[0]).toContain("BÁO CÁO ĐỒ ÁN");
  });

  it("tài liệu 2 trang: dòng ở cả hai trang bị bỏ, dòng chỉ ở một trang thì giữ (cần ≥ 2 trang)", () => {
    const out = stripRepeatedPageLines(["Header chung\nthân một\nchỉ trang một", "Header chung\nthân hai"]);
    expect(out).toEqual(["thân một\nchỉ trang một", "thân hai"]);
  });

  it("một trang / không trang → giữ nguyên; luôn trả bản sao cùng độ dài", () => {
    const one = ["Header\nnội dung\nFooter"];
    expect(stripRepeatedPageLines(one)).toEqual(one);
    expect(stripRepeatedPageLines(one)).not.toBe(one);
    expect(stripRepeatedPageLines([])).toEqual([]);
    expect(stripRepeatedPageLines(["", "", ""])).toEqual(["", "", ""]);
  });

  it("tham số tuỳ chỉnh: tăng minPageRatio thì header lặp ở nửa số trang không còn bị bỏ", () => {
    const pages = ["H\nx1\nx2\nx3\nx4\nx5\nx6\nx7", "H\ny1\ny2\ny3\ny4\ny5\ny6\ny7", "z1\nz2\nz3\nz4\nz5\nz6\nz7\nz8", "w1\nw2\nw3\nw4\nw5\nw6\nw7\nw8"];
    expect(stripRepeatedPageLines(pages)[0].startsWith("x1")).toBe(true);
    expect(stripRepeatedPageLines(pages, { minPageRatio: 0.75 })[0].startsWith("H")).toBe(true);
  });
});

describe("removeBoilerplatePhrases", () => {
  const text = "Kính gửi hội đồng. Em xin cam đoan đây là công trình của riêng em. Nội dung chính bắt đầu từ đây.";

  it("bỏ cụm câu mẫu bất kể dấu/hoa thường/dấu câu; token còn lại giữ nguyên offset gốc", () => {
    const tokens = tokenizeText(text);
    const out = removeBoilerplatePhrases(tokens, ["EM XIN CAM DOAN, đây là công trình của riêng em"]);
    expect(out.map((t) => t.value).join(" ")).toBe("kinh gui hoi dong noi dung chinh bat dau tu day");
    const last = out[out.length - 1];
    expect(text.slice(last.start, last.end)).toBe("đây");
  });

  it("nhiều cụm cùng khớp tại một chỗ → lấy cụm dài nhất; cụm chỉ khớp một phần thì không bỏ", () => {
    const tokens = tokenizeText("a b c d e f");
    expect(removeBoilerplatePhrases(tokens, ["a b", "a b c d"]).map((t) => t.value)).toEqual(["e", "f"]);
    expect(removeBoilerplatePhrases(tokens, ["e f g"]).map((t) => t.value)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("không cụm / cụm rỗng sau chuẩn hoá → trả bản sao nguyên vẹn", () => {
    const tokens = tokenizeText(text);
    expect(removeBoilerplatePhrases(tokens, [])).toEqual(tokens);
    expect(removeBoilerplatePhrases(tokens, ["!!! ...", "   "])).toEqual(tokens);
    expect(removeBoilerplatePhrases(tokens, [])).not.toBe(tokens);
  });

  it("cụm xuất hiện nhiều lần đều bị bỏ", () => {
    const tokens = tokenizeText("x y z x y w x y");
    expect(removeBoilerplatePhrases(tokens, ["x y"]).map((t) => t.value)).toEqual(["z", "w"]);
  });
});
