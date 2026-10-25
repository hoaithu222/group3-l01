import { PLAGIARISM_DEFAULTS } from "../constants";
import type { Posting } from "../types";

/** Một cặp fingerprint cùng hash: k-gram bắt đầu ở token `targetPos` của tài liệu đích và `sourcePos` của tài liệu nguồn. */
export interface PositionMatch {
  hash: number;
  targetPos: number;
  sourcePos: number;
}

/** Một đoạn trùng theo TOKEN (nửa khoảng [start, end)); đổi sang ký tự/dòng bằng `toSpanRange`. */
export interface TokenSection {
  targetStart: number;
  targetEnd: number;
  sourceStart: number;
  sourceEnd: number;
  /** Số hash KHÁC NHAU khớp trong đoạn (README §4 `matchedHashes`). */
  matchedHashes: number;
  /** % fingerprint của đích nằm trong đoạn mà nguồn cũng có (0–100, làm tròn xuống). */
  similarity: number;
}

export interface PairOptions {
  /** Chỉ ghép hash thuộc tập này (= `H_A'` sau khi trừ tệp loại trừ + câu chữ phổ biến); bỏ trống = mọi hash. */
  allowedHashes?: ReadonlySet<number>;
  maxOccurrencesPerHash?: number;
  maxPairs?: number;
}

export interface MergeOptions {
  /** Độ dài k-gram (đoạn trùng được nới thêm k − 1 token cuối vì fingerprint chỉ ghi vị trí ĐẦU k-gram). */
  k: number;
  mergeGapTokens?: number;
  minSectionTokens?: number;
  sectionsMax?: number;
}

/**
 * Ghép các fingerprint cùng hash của hai tài liệu thành cặp vị trí, sắp theo `targetPos` rồi `sourcePos` (hai danh sách
 * fingerprint PHẢI sắp theo `pos` tăng dần — `winnow` trả đúng thế). Hash lặp quá
 * `maxOccurrencesPerHash` lần ở MỘT trong hai phía (bảng biểu, "a a a a…") bị bỏ — nếu không tích Descartes O(n²) làm
 * một tài liệu bệnh lý treo cả worker; đoạn trùng thật vẫn còn các hash không lặp bao quanh. Tổng cặp bị chặn ở `maxPairs`
 * (dừng theo thứ tự vị trí đích nên kết quả tất định).
 */
export function pairPostings(target: readonly Posting[], source: readonly Posting[], options: PairOptions = {}): PositionMatch[] {
  const allowed = options.allowedHashes;
  const maxOcc = options.maxOccurrencesPerHash ?? PLAGIARISM_DEFAULTS.maxOccurrencesPerHash;
  const maxPairs = options.maxPairs ?? PLAGIARISM_DEFAULTS.maxMatchPairs;

  const sourcePositions = new Map<number, number[]>();
  for (const p of source) {
    if (allowed && !allowed.has(p.hash)) continue;
    const list = sourcePositions.get(p.hash);
    if (list) list.push(p.pos);
    else sourcePositions.set(p.hash, [p.pos]);
  }
  const targetCounts = new Map<number, number>();
  for (const p of target) {
    if (sourcePositions.has(p.hash)) targetCounts.set(p.hash, (targetCounts.get(p.hash) ?? 0) + 1);
  }

  const out: PositionMatch[] = [];
  for (const p of target) {
    const positions = sourcePositions.get(p.hash);
    if (!positions || positions.length > maxOcc || (targetCounts.get(p.hash) ?? 0) > maxOcc) continue;
    for (const sourcePos of positions) {
      if (out.length >= maxPairs) return out;
      out.push({ hash: p.hash, targetPos: p.pos, sourcePos });
    }
  }
  return out;
}

interface Chain {
  t0: number;
  s0: number;
  tLast: number;
  sLast: number;
  matches: number;
  hashes: Set<number>;
}

/** Số phần tử của `sorted` (tăng dần theo `pos`) có `pos` trong [from, to]. */
function countPositionsIn(sorted: readonly Posting[], from: number, to: number): number {
  const lower = (x: number): number => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid].pos < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return lower(to + 1) - lower(from);
}

/**
 * Nối các cặp vị trí thành ĐOẠN TRÙNG (be.md §5.3 bước 6): hai cặp nối được khi cả hai phía cùng tiến (cùng chiều, cách
 * nhau ≥ 1 và ≤ `mergeGapTokens` token, đo giữa hai vị trí đầu k-gram). Cặp có nhiều chuỗi để nối thì chọn chuỗi gần nhất
 * (tổng khoảng cách nhỏ nhất). Đoạn dài = từ token đầu tiên đến hết k-gram cuối (`+ k`); chỉ giữ đoạn dài ≥
 * `minSectionTokens` ở CẢ HAI phía. Đảo thứ tự hàm/đoạn văn → nhiều đoạn, mỗi đoạn một cặp (đích, nguồn) riêng. Trần
 * `sectionsMax` giữ các đoạn DÀI nhất (hoà → đoạn đích đứng trước); kết quả sắp theo vị trí đích.
 *
 * `matches` phải sắp theo `targetPos` tăng dần (như `pairPostings` trả về). `targetPostings` là fingerprint của đích đã lọc
 * cùng tập `allowedHashes` (để tính `similarity` = đã khớp / kỳ vọng trong đoạn).
 */
export function mergeMatches(matches: readonly PositionMatch[], targetPostings: readonly Posting[], options: MergeOptions): TokenSection[] {
  const { k } = options;
  const gap = options.mergeGapTokens ?? PLAGIARISM_DEFAULTS.mergeGapTokens;
  const minTokens = options.minSectionTokens ?? PLAGIARISM_DEFAULTS.minSectionTokens;
  const sectionsMax = options.sectionsMax ?? PLAGIARISM_DEFAULTS.sectionsPerTargetMax;

  const chains: Chain[] = [];
  const open: Chain[] = [];
  for (const m of matches) {
    let kept = 0;
    for (const c of open) if (c.tLast + gap >= m.targetPos) open[kept++] = c;
    open.length = kept;
    let best: Chain | null = null;
    let bestDistance = Infinity;
    for (const c of open) {
      const dt = m.targetPos - c.tLast;
      const ds = m.sourcePos - c.sLast;
      if (dt > 0 && dt <= gap && ds > 0 && ds <= gap && dt + ds < bestDistance) {
        best = c;
        bestDistance = dt + ds;
      }
    }
    if (best) {
      best.tLast = m.targetPos;
      best.sLast = m.sourcePos;
      best.matches++;
      best.hashes.add(m.hash);
    } else {
      const c: Chain = { t0: m.targetPos, s0: m.sourcePos, tLast: m.targetPos, sLast: m.sourcePos, matches: 1, hashes: new Set([m.hash]) };
      chains.push(c);
      open.push(c);
    }
  }

  const sections: TokenSection[] = [];
  for (const c of chains) {
    const targetEnd = c.tLast + k;
    const sourceEnd = c.sLast + k;
    if (Math.min(targetEnd - c.t0, sourceEnd - c.s0) < minTokens) continue;
    const expected = countPositionsIn(targetPostings, c.t0, c.tLast);
    sections.push({
      targetStart: c.t0,
      targetEnd,
      sourceStart: c.s0,
      sourceEnd,
      matchedHashes: c.hashes.size,
      similarity: expected > 0 ? Math.min(100, Math.floor((c.matches * 100) / expected)) : 0,
    });
  }
  return limitSections(sections, sectionsMax);
}

/** Giữ tối đa `max` đoạn DÀI nhất (theo phía ngắn hơn), hoà thì đoạn đứng trước ở đích; trả về sắp theo vị trí đích. */
export function limitSections(sections: readonly TokenSection[], max: number): TokenSection[] {
  const length = (s: TokenSection): number => Math.min(s.targetEnd - s.targetStart, s.sourceEnd - s.sourceStart);
  const byPosition = (a: TokenSection, b: TokenSection): number => a.targetStart - b.targetStart || a.sourceStart - b.sourceStart;
  if (sections.length <= max) return [...sections].sort(byPosition);
  return [...sections]
    .sort((a, b) => length(b) - length(a) || byPosition(a, b))
    .slice(0, max)
    .sort(byPosition);
}

/** Tiện ích ghép + nối cho MỘT cặp (đích, nguồn): `pairPostings` → `mergeMatches` trên fingerprint đã lọc `allowedHashes`. */
export function buildSections(
  target: readonly Posting[],
  source: readonly Posting[],
  options: PairOptions & MergeOptions,
): TokenSection[] {
  const allowed = options.allowedHashes;
  const filteredTarget = allowed ? target.filter((p) => allowed.has(p.hash)) : target;
  return mergeMatches(pairPostings(target, source, options), filteredTarget, options);
}
