import { PLAGIARISM_ALGO_VERSION, PLAGIARISM_DEFAULTS } from "../lib/constants";
import { commonHashSet, effectiveHashes, scoreTarget } from "../lib/match/containment";
import { buildSections } from "../lib/match/section-merger";
import { buildLineStarts, toSpanRange } from "../lib/match/span-range";
import { normalizeText } from "../lib/normalize/text-normalizer";
import { fingerprintCode, fingerprintText, fingerprintTokens, type DocumentFingerprintData } from "../lib/pipeline";

/** PRNG có seed (mulberry32) — dữ liệu "ngẫu nhiên" nhưng tái lập tuyệt đối giữa các lần chạy/máy. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Từ vựng giả-tiếng-Việt (âm đầu × nguyên âm có dấu × âm cuối) xáo có seed, lấy 1.500 từ: hai văn bản độc lập gần như không thể trùng một cụm 5 từ. */
const VOCAB: string[] = (() => {
  const onsets = ["b", "c", "d", "đ", "g", "h", "k", "l", "m", "n", "ph", "qu", "s", "t", "th", "tr", "v", "x", "ch", "kh", "ng", "nh"];
  const nuclei = ["a", "ă", "â", "e", "ê", "i", "o", "ô", "ơ", "u", "ư", "ạ", "ả", "ấ", "ề", "ộ", "ữ", "ự", "ị", "ế", "ỏ", "ồ"];
  const codas = ["", "n", "m", "c", "ng", "nh", "t", "p"];
  const all = onsets.flatMap((o) => nuclei.flatMap((n) => codas.map((c) => `${o}${n}${c}`)));
  const rand = prng(2026);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 1500);
})();

const words = (seed: number, n: number): string[] => {
  const rand = prng(seed);
  return Array.from({ length: n }, () => VOCAB[Math.floor(rand() * VOCAB.length)]);
};

/** Dựng văn bản có dấu câu và viết hoa đầu câu như bài thật (cứ 12 từ một câu). */
const asText = (ws: string[]): string => {
  const sentences: string[] = [];
  for (let i = 0; i < ws.length; i += 12) {
    const s = ws.slice(i, i + 12).join(" ");
    sentences.push(s.charAt(0).toUpperCase() + s.slice(1));
  }
  return `${sentences.join(". ")}.`;
};

const K = PLAGIARISM_DEFAULTS.text.k;
const asSet = (f: DocumentFingerprintData): Set<number> => new Set(f.hashes);

describe("IR-10 / PLAG-01 — văn bản: 2 bài sao chép nhau 60 %, bài thứ ba độc lập", () => {
  const A = words(1, 1000);
  const B = [...A.slice(0, 600), ...words(2, 400)];
  const C = words(3, 1000);
  const textA = asText(A);
  const textB = asText(B);
  const fa = fingerprintText(textA);
  const fb = fingerprintText(textB);
  const fc = fingerprintText(asText(C));

  it("điểm mỗi bài ≥ 50 và nguồn trùng nhiều nhất trỏ sang bài kia; bài thứ ba < 20 và không bị coi là nguồn", () => {
    const a = scoreTarget(asSet(fa), [{ id: "B", hashes: fb.hashes }, { id: "C", hashes: fc.hashes }]);
    const b = scoreTarget(asSet(fb), [{ id: "A", hashes: fa.hashes }, { id: "C", hashes: fc.hashes }]);
    expect(a.score).toBeGreaterThanOrEqual(50);
    expect(b.score).toBeGreaterThanOrEqual(50);
    expect(a.sources.map((s) => s.id)).toEqual(["B"]);
    expect(b.sources.map((s) => s.id)).toEqual(["A"]);
    expect(a.level === "HIGH" && b.level === "HIGH").toBe(true);
    const c = scoreTarget(asSet(fc), [{ id: "A", hashes: fa.hashes }, { id: "B", hashes: fb.hashes }]);
    expect(c.score).toBeLessThan(20);
    expect(c.level).toBe("LOW");
  });

  it("có đúng một đoạn đối chiếu phủ ~600 từ đầu; ký tự/dòng của hai phía ứng với cùng nội dung chuẩn hoá", () => {
    const sections = buildSections(fa.postings, fb.postings, { k: K });
    expect(sections).toHaveLength(1);
    const [s] = sections;
    expect(s.targetStart).toBeLessThanOrEqual(3);
    expect(s.targetEnd).toBeGreaterThanOrEqual(595);
    expect(s.targetEnd).toBeLessThanOrEqual(600);
    expect(s.sourceStart).toBe(s.targetStart);
    expect(s.similarity).toBeGreaterThanOrEqual(95);

    const left = toSpanRange(fa.tokens, buildLineStarts(textA), s.targetStart, s.targetEnd);
    const right = toSpanRange(fb.tokens, buildLineStarts(textB), s.sourceStart, s.sourceEnd);
    expect(normalizeText(textA.slice(left.startChar, left.endChar))).toBe(normalizeText(textB.slice(right.startChar, right.endChar)));
    expect(left.lineStart).toBe(1);
  });
});

describe("PLAG-11 — cùng nội dung, khác dấu/hoa thường/dấu câu/dạng Unicode → điểm ≥ 80", () => {
  const base = asText(words(7, 300));
  const variants: Record<string, string> = {
    "bỏ dấu tiếng Việt": base
      .normalize("NFD")
      .replace(/[\u{0300}-\u{036F}]/gu, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D"),
    "CHỮ HOA": base.toUpperCase(),
    "xen dấu câu và khoảng trắng": base.split(" ").join("  ,\n; "),
    "Unicode tổ hợp (NFD)": base.normalize("NFD"),
  };

  it.each(Object.entries(variants))("%s", (_name, variant) => {
    const original = fingerprintText(base);
    const changed = fingerprintText(variant);
    expect(scoreTarget(asSet(original), [{ id: "v", hashes: changed.hashes }]).score).toBeGreaterThanOrEqual(80);
    expect(changed.hashes).toEqual(original.hashes);
  });
});

describe("PLAG-05 — loại trừ tệp mẫu và câu chữ phổ biến", () => {
  it("hai bài chỉ chung đề cương mẫu: có mẫu thì trùng nhiều, trừ hash của tệp mẫu (excludeResourceIds) → < 20 và không có đoạn trùng", () => {
    const template = words(20, 300);
    const templateDoc = fingerprintText(asText(template));
    const a = fingerprintText(asText([...template, ...words(21, 100)]));
    const b = fingerprintText(asText([...template, ...words(22, 100)]));
    expect(scoreTarget(asSet(a), [{ id: "b", hashes: b.hashes }]).score).toBeGreaterThanOrEqual(50);

    const cleaned = effectiveHashes(a.hashes, { excluded: new Set(templateDoc.hashes) });
    expect(scoreTarget(cleaned, [{ id: "b", hashes: b.hashes }]).score).toBeLessThan(20);
    expect(buildSections(a.postings, b.postings, { k: K, allowedHashes: cleaned })).toEqual([]);
  });

  it("mẫu xuất hiện ở 6/6 tài liệu của workspace (≥ 5 tài liệu và ≥ 30 %) bị lọc theo tần suất dù không ai khai loại trừ", () => {
    const template = words(30, 150);
    const docs = [1, 2, 3, 4, 5, 6].map((i) => fingerprintText(asText([...template, ...words(40 + i, 250)])));
    const docFreq = new Map<number, number>();
    for (const d of docs) for (const h of d.hashes) docFreq.set(h, (docFreq.get(h) ?? 0) + 1);
    const common = commonHashSet(docFreq, docs.length);

    const raw = scoreTarget(asSet(docs[0]), [{ id: "d1", hashes: docs[1].hashes }]);
    const filtered = scoreTarget(effectiveHashes(docs[0].hashes, { common }), [{ id: "d1", hashes: docs[1].hashes }]);
    expect(raw.score).toBeGreaterThanOrEqual(30);
    expect(filtered.score).toBeLessThan(20);
  });
});

describe("đảo thứ tự đoạn văn", () => {
  it("10 đoạn xáo trộn (không cặp nào còn liền kề như bản gốc) → điểm ≥ 80 và đúng 10 đoạn đối chiếu, mỗi đoạn khớp nội dung", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => words(100 + i, 100));
    const order = [3, 7, 1, 9, 5, 0, 8, 2, 6, 4];
    const fa = fingerprintText(asText(paragraphs.flat()));
    const fb = fingerprintText(asText(order.flatMap((i) => paragraphs[i])));
    expect(scoreTarget(asSet(fa), [{ id: "b", hashes: fb.hashes }]).score).toBeGreaterThanOrEqual(80);

    const sections = buildSections(fa.postings, fb.postings, { k: K });
    expect(sections).toHaveLength(10);
    for (const s of sections) {
      const left = fa.tokens.slice(s.targetStart, s.targetEnd).map((t) => t.value);
      const right = fb.tokens.slice(s.sourceStart, s.sourceEnd).map((t) => t.value);
      expect(left).toEqual(right);
    }
  });
});

describe("bất biến của đường ống fingerprint", () => {
  it("GOLDEN (văn bản): khoá phiên bản thuật toán — đổi bất kỳ bước nào (chuẩn hoá, băm, seed, k, cửa sổ) làm test này đỏ và PHẢI tăng ALGO_VERSION rồi reindex", () => {
    expect(PLAGIARISM_ALGO_VERSION).toBe(1);
    const f = fingerprintText("Sinh viên nộp báo cáo đồ án tốt nghiệp vào cuối học kỳ để hội đồng chấm điểm và đánh giá kết quả nghiên cứu của nhóm");
    expect(f.tokens).toHaveLength(27);
    expect(f.postings).toEqual([
      { hash: -1456660723, pos: 1 },
      { hash: -1280032892, pos: 2 },
      { hash: -676881439, pos: 4 },
      { hash: 454047317, pos: 8 },
      { hash: -65052329, pos: 9 },
      { hash: -1617641929, pos: 10 },
      { hash: -800109002, pos: 14 },
      { hash: -1937181005, pos: 16 },
      { hash: 675175980, pos: 20 },
      { hash: -1151603308, pos: 22 },
    ]);
    expect(f.hashes).toEqual([-1937181005, -1617641929, -1456660723, -1280032892, -1151603308, -800109002, -676881439, -65052329, 454047317, 675175980]);
  });

  it("GOLDEN (mã nguồn họ C)", () => {
    const f = fingerprintCode("for (let i = 0; i < items.length; i++) { if (items[i].price > 0) { total += items[i].price * items[i].qty; } } return total;", "c-like");
    expect(f.tokens).toHaveLength(50);
    expect(f.postings).toEqual([
      { hash: -1963503113, pos: 5 },
      { hash: -2042769026, pos: 13 },
      { hash: -1765283336, pos: 17 },
      { hash: -1171285528, pos: 21 },
      { hash: -440862899, pos: 27 },
      { hash: -947068167, pos: 32 },
    ]);
    expect(f.k).toBe(12);
    expect(f.window).toBe(8);
  });

  it("tất định: chạy hai lần cho kết quả giống hệt", () => {
    const text = asText(words(5, 400));
    expect(fingerprintText(text)).toEqual(fingerprintText(text));
  });

  it("tài liệu ngắn: dưới k token → không fingerprint; đúng k token → một fingerprint", () => {
    const four = fingerprintText("một hai ba bốn");
    expect(four).toMatchObject({ postings: [], hashes: [], truncated: false });
    const five = fingerprintText("một hai ba bốn năm");
    expect(five.postings).toHaveLength(1);
    expect(five.postings[0].pos).toBe(0);
    expect(fingerprintText("")).toMatchObject({ postings: [], hashes: [] });
    expect(fingerprintCode("", "python")).toMatchObject({ postings: [], hashes: [] });
  });

  it("vượt fingerprintsPerDocMax: cắt còn các hash NHỎ NHẤT và báo truncated", () => {
    const text = asText(words(6, 500));
    const full = fingerprintText(text);
    expect(full.truncated).toBe(false);
    const cut = fingerprintText(text, { fingerprintsPerDocMax: 20 });
    expect(cut.truncated).toBe(true);
    expect(cut.hashes).toEqual(full.hashes.slice(0, 20));
    expect(cut.postings).toEqual(full.postings);
  });

  it("algoVersion khác → hash khác hẳn (fingerprint cũ và mới không lẫn với nhau)", () => {
    const text = asText(words(8, 200));
    const v1 = fingerprintText(text);
    const v2 = fingerprintText(text, { algoVersion: 2 });
    expect(v1.algoVersion).toBe(1);
    expect(v2.algoVersion).toBe(2);
    expect(v2.hashes.filter((h) => v1.hashes.includes(h))).toEqual([]);
  });

  it("cụm câu mẫu bị bỏ trước khi băm: thêm/bớt cụm không đổi fingerprint; offset token còn lại vẫn trỏ đúng văn bản gốc", () => {
    const body = asText(words(50, 200));
    const phrase = "Em xin cam đoan đây là công trình nghiên cứu của riêng em";
    const withPhrase = `${phrase}. ${body}`;
    const a = fingerprintText(withPhrase, { boilerplatePhrases: [phrase] });
    const b = fingerprintText(body, { boilerplatePhrases: [phrase] });
    expect(a.hashes).toEqual(b.hashes);
    expect(a.tokens).toHaveLength(b.tokens.length);
    expect(withPhrase.slice(a.tokens[0].start, a.tokens[0].end).toLowerCase()).toBe(body.slice(b.tokens[0].start, b.tokens[0].end).toLowerCase());
    expect(fingerprintText(withPhrase).hashes).not.toEqual(b.hashes);
  });

  it("mật độ winnowing ≈ 2/(w+1) = 40 % số k-gram; hash là int32 có dấu; vị trí tăng dần", () => {
    const f = fingerprintText(asText(words(9, 20_000)));
    const ratio = f.postings.length / (f.tokens.length - K + 1);
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.45);
    expect(f.postings.every((p, i) => Number.isInteger(p.hash) && p.hash >= -0x80000000 && p.hash <= 0x7fffffff && (i === 0 || p.pos > f.postings[i - 1].pos))).toBe(true);
  });

  it("fingerprintTokens nhận k/cửa sổ tuỳ chỉnh", () => {
    const tokens = words(12, 50).map((value, i) => ({ value, start: i * 10, end: i * 10 + 5 }));
    const f = fingerprintTokens(tokens, "TEXT", { params: { k: 3, window: 2 } });
    expect(f).toMatchObject({ k: 3, window: 2, kind: "TEXT" });
    expect(f.postings.length).toBeGreaterThan(fingerprintTokens(tokens, "TEXT").postings.length);
  });
});
