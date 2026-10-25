import fc from "fast-check";
import { murmur3Hash32, murmur3Hash32Words } from "../lib/fingerprint/murmur3";

/**
 * Bản tham chiếu ĐỘC LẬP viết bằng BigInt theo đặc tả gốc (không dùng `Math.imul`/toán tử bit int32 như bản chạy thật) —
 * làm "nhân chứng" thứ hai bên cạnh các vector công bố: hai cách cài khác hẳn nhau cùng ra một số thì mới tin được.
 */
const MASK = 0xffffffffn;
const rotl = (x: bigint, r: bigint): bigint => ((x << r) | (x >> (32n - r))) & MASK;
const mul = (a: bigint, b: bigint): bigint => (a * b) & MASK;

function reference(bytes: Uint8Array, seed: number): number {
  let h = BigInt(seed) & MASK;
  const blocks = bytes.length >> 2;
  const mixK = (k: bigint): bigint => mul(rotl(mul(k, 0xcc9e2d51n), 15n), 0x1b873593n);
  for (let i = 0; i < blocks; i++) {
    const o = 4 * i;
    const k = BigInt(bytes[o]) | (BigInt(bytes[o + 1]) << 8n) | (BigInt(bytes[o + 2]) << 16n) | (BigInt(bytes[o + 3]) << 24n);
    h = (mul(rotl(h ^ mixK(k), 13n), 5n) + 0xe6546b64n) & MASK;
  }
  const t = blocks * 4;
  const rest = bytes.length & 3;
  let k = 0n;
  if (rest >= 3) k ^= BigInt(bytes[t + 2]) << 16n;
  if (rest >= 2) k ^= BigInt(bytes[t + 1]) << 8n;
  if (rest >= 1) {
    k ^= BigInt(bytes[t]);
    h ^= mixK(k);
  }
  h ^= BigInt(bytes.length);
  h ^= h >> 16n;
  h = mul(h, 0x85ebca6bn);
  h ^= h >> 13n;
  h = mul(h, 0xc2b2ae35n);
  h ^= h >> 16n;
  return Number(h & MASK);
}

describe("murmur3Hash32", () => {
  // Vector công bố của MurmurHash3_x86_32 (Wikipedia, SMHasher, Guava/Commons Codec).
  const VECTORS: [string, number, number][] = [
    ["", 0, 0x00000000],
    ["", 1, 0x514e28b7],
    ["", 0xffffffff, 0x81f16f39],
    ["test", 0, 0xba6bd213],
    ["abc", 0, 0xb3dd93fa],
    ["Hello, world!", 0, 0xc0363e43],
    ["Hello, world!", 0x9747b28c, 0x24884cba],
    ["The quick brown fox jumps over the lazy dog", 0, 0x2e4ff723],
    ["The quick brown fox jumps over the lazy dog", 0x9747b28c, 0x2fa826cd],
    // Độ dài đuôi 0, 1, 2, 3, 4 byte (đuôi 1–3 đi nhánh riêng của thuật toán).
    ["a", 0x9747b28c, 0x7fa09ea6],
    ["aa", 0x9747b28c, 0x5d211726],
    ["aaa", 0x9747b28c, 0x283e0130],
    ["aaaa", 0x9747b28c, 0x5a97808a],
    ["ab", 0x9747b28c, 0x74875592],
    ["abc", 0x9747b28c, 0xc84a62dd],
    ["abcd", 0x9747b28c, 0xf0478627],
  ];

  it.each(VECTORS)("khớp vector chuẩn: %j (seed %i)", (input, seed, expected) => {
    expect(murmur3Hash32(input, seed)).toBe(expected);
    expect(reference(Buffer.from(input, "utf8"), seed)).toBe(expected);
  });

  it("chuỗi được băm theo UTF-8: cùng kết quả với mảng byte UTF-8 (tiếng Việt, emoji)", () => {
    for (const s of ["Việt Nam", "Trường Đại học Bách Khoa", "đồ án 🎓", "日本語"]) {
      expect(murmur3Hash32(s, 7)).toBe(murmur3Hash32(new Uint8Array(Buffer.from(s, "utf8")), 7));
      expect(murmur3Hash32(s, 7)).toBe(reference(Buffer.from(s, "utf8"), 7));
    }
  });

  it("dạng tổ hợp (NFD) và dựng sẵn (NFC) là hai dãy byte khác nhau nên ra hash khác — chuẩn hoá là việc của bước trước", () => {
    expect(murmur3Hash32("Việt".normalize("NFC"))).not.toBe(murmur3Hash32("Việt".normalize("NFD")));
  });

  it("tất định và luôn là uint32", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), fc.integer({ min: 0, max: 0xffffffff }), (s, seed) => {
        const h = murmur3Hash32(s, seed);
        expect(h).toBe(murmur3Hash32(s, seed));
        expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
      }),
    );
  });

  it("property: bản chạy thật trùng bản tham chiếu BigInt trên byte ngẫu nhiên mọi độ dài/seed", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 70 }), fc.integer({ min: 0, max: 0xffffffff }), (bytes, seed) => {
        expect(murmur3Hash32(bytes, seed)).toBe(reference(bytes, seed));
      }),
      { numRuns: 500 },
    );
  });

  it("seed khác → hash khác (seed là nơi gắn phiên bản thuật toán)", () => {
    expect(murmur3Hash32("cùng một nội dung", 1)).not.toBe(murmur3Hash32("cùng một nội dung", 2));
  });
});

describe("murmur3Hash32Words", () => {
  const toBytesLE = (words: readonly number[]): Buffer => {
    const buf = Buffer.alloc(words.length * 4);
    words.forEach((w, i) => buf.writeUInt32LE(w >>> 0, i * 4));
    return buf;
  };

  it("bằng murmur3Hash32 trên dãy byte little-endian của các từ (property, mọi độ dài/seed)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -0x80000000, max: 0xffffffff }), { maxLength: 30 }), fc.integer({ min: 0, max: 0xffffffff }), (words, seed) => {
        expect(murmur3Hash32Words(words, 0, words.length, seed)).toBe(murmur3Hash32(toBytesLE(words), seed));
      }),
    );
  });

  it("chỉ băm đoạn [start, start+count) — cửa sổ trượt dùng lại một mảng băm token", () => {
    const words = [11, 22, 33, 44, 55, 66];
    expect(murmur3Hash32Words(words, 2, 3, 5)).toBe(murmur3Hash32(toBytesLE([33, 44, 55]), 5));
    expect(murmur3Hash32Words(words, 0, 0, 5)).toBe(murmur3Hash32("", 5));
  });

  it("thứ tự từ có ý nghĩa: đảo hai từ → hash khác", () => {
    expect(murmur3Hash32Words([1, 2, 3], 0, 3, 0)).not.toBe(murmur3Hash32Words([1, 3, 2], 0, 3, 0));
  });
});
