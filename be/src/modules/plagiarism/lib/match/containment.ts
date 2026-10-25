import { PLAGIARISM_DEFAULTS } from "../constants";
import type { PlagiarismLevel } from "../types";

/** Tập hash (hoặc mảng — sẽ được chuyển thành tập, vì `DocumentFingerprint.hashes` là mảng đã loại trùng). */
export type HashCollection = ReadonlySet<number> | readonly number[];

export interface SourceHashes {
  id: string;
  hashes: HashCollection;
}

export interface Thresholds {
  medium: number;
  high: number;
}

export interface CommonHashOptions {
  /** Số tài liệu tối thiểu chứa hash (mặc định 5 — `commonDocMinCount`). */
  minCount?: number;
  /** % tối thiểu số tài liệu của workspace chứa hash (mặc định 30 — `commonDocFrequencyPercent`). */
  frequencyPercent?: number;
}

export interface ScoreOptions {
  minPairPercent?: number;
  candidateSourcesMax?: number;
  thresholds?: Thresholds;
}

export interface PairScore {
  id: string;
  /** containment(đích ← nguồn) theo %, làm tròn xuống. */
  similarity: number;
  /** Số hash chung (giao) giữa đích và nguồn. */
  shared: number;
}

export interface TargetScore {
  /** Điểm tệp 0–100: % hash của đích được phủ bởi HỢP các nguồn giữ lại, làm tròn xuống. */
  score: number;
  level: PlagiarismLevel;
  /** |H_A'|: 0 → không đủ chữ để so (caller đặt `SKIPPED NO_TEXT`). */
  totalHashes: number;
  coveredHashes: number;
  /** Nguồn giữ lại (≥ `minPairPercent`, tối đa `candidateSourcesMax`), giảm dần theo similarity, hoà thì theo `id`. */
  sources: PairScore[];
}

const asSet = (c: HashCollection): ReadonlySet<number> => (c instanceof Set ? c : new Set(c));

/** floor(100·shared/total) bằng số nguyên (không lệch do số thực); `total = 0` → 0. */
export function containmentPercent(shared: number, total: number): number {
  return total > 0 ? Math.floor((shared * 100) / total) : 0;
}

/** Mức trùng theo ngưỡng: LOW < medium ≤ MEDIUM < high ≤ HIGH (README §2). */
export function levelForScore(score: number, thresholds: Thresholds = PLAGIARISM_DEFAULTS.thresholds): PlagiarismLevel {
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

/**
 * Hash "phổ biến" trong workspace (README §2: xuất hiện ở ≥ 30 % VÀ ≥ 5 tài liệu): đề cương mẫu, câu mở đầu quen thuộc,
 * danh mục tài liệu tham khảo… — lọc khỏi điểm để hai bài chỉ chung mẫu không bị coi là trùng. `docFreq` = số tài liệu
 * (cùng loại) chứa từng hash; so sánh bằng số nguyên (`freq·100 ≥ percent·N`) nên không sai lệch làm tròn.
 */
export function commonHashSet(docFreq: ReadonlyMap<number, number>, totalDocs: number, options: CommonHashOptions = {}): Set<number> {
  const minCount = options.minCount ?? PLAGIARISM_DEFAULTS.commonDocMinCount;
  const percent = options.frequencyPercent ?? PLAGIARISM_DEFAULTS.commonDocFrequencyPercent;
  const common = new Set<number>();
  for (const [hash, freq] of docFreq) {
    if (freq >= minCount && freq * 100 >= percent * totalDocs) common.add(hash);
  }
  return common;
}

/** H_A' = H_A \ H_loại-trừ \ H_phổ-biến (be.md §5.3 bước 4). */
export function effectiveHashes(
  hashes: HashCollection,
  removals: { excluded?: ReadonlySet<number>; common?: ReadonlySet<number> } = {},
): Set<number> {
  const out = new Set<number>();
  for (const h of asSet(hashes)) {
    if (removals.excluded?.has(h) || removals.common?.has(h)) continue;
    out.add(h);
  }
  return out;
}

/** Hợp các tập hash (vd `H_excl` = hợp hash của mọi tệp loại trừ). */
export function unionHashes(collections: readonly HashCollection[]): Set<number> {
  const out = new Set<number>();
  for (const c of collections) for (const h of asSet(c)) out.add(h);
  return out;
}

/**
 * Chấm điểm MỘT tệp đích (be.md §5.3 bước 5). `target` là H_A' đã trừ loại trừ/phổ biến. Với mỗi nguồn tính
 * containment(A←B) = |H_A' ∩ H_B| / |H_A'| (BẤT ĐỐI XỨNG đúng nghĩa "bao nhiêu phần bài này có ở nơi khác"); giữ nguồn ≥
 * `minPairPercent`, tối đa `candidateSourcesMax`; điểm tệp = phần H_A' được phủ bởi HỢP các nguồn giữ lại. Không nguồn nào
 * thì điểm 0. Hoà thứ hạng → theo `id` (so sánh chuỗi, không phụ thuộc locale) để kết quả tất định.
 */
export function scoreTarget(target: ReadonlySet<number>, sources: readonly SourceHashes[], options: ScoreOptions = {}): TargetScore {
  const minPair = options.minPairPercent ?? PLAGIARISM_DEFAULTS.minPairPercent;
  const maxSources = options.candidateSourcesMax ?? PLAGIARISM_DEFAULTS.candidateSourcesMax;
  const thresholds = options.thresholds ?? PLAGIARISM_DEFAULTS.thresholds;
  const total = target.size;

  const scored: { pair: PairScore; shared: number[] }[] = [];
  for (const src of sources) {
    const shared: number[] = [];
    for (const h of asSet(src.hashes)) if (target.has(h)) shared.push(h);
    const similarity = containmentPercent(shared.length, total);
    if (shared.length > 0 && similarity >= minPair) scored.push({ pair: { id: src.id, similarity, shared: shared.length }, shared });
  }
  scored.sort((a, b) => b.pair.similarity - a.pair.similarity || b.pair.shared - a.pair.shared || (a.pair.id < b.pair.id ? -1 : a.pair.id > b.pair.id ? 1 : 0));
  const kept = scored.slice(0, maxSources);

  const covered = new Set<number>();
  for (const s of kept) for (const h of s.shared) covered.add(h);
  const score = containmentPercent(covered.size, total);
  return { score, level: levelForScore(score, thresholds), totalHashes: total, coveredHashes: covered.size, sources: kept.map((s) => s.pair) };
}
