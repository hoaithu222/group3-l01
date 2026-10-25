import { PLAGIARISM_ALGO_VERSION, PLAGIARISM_DEFAULTS } from "./constants";
import { hashSeedForAlgo, kgramHashes } from "./fingerprint/kgram";
import { distinctSortedHashes, winnow } from "./fingerprint/winnow";
import { removeBoilerplatePhrases } from "./normalize/boilerplate";
import { tokenizeCode } from "./normalize/code-tokenizer";
import { tokenizeText } from "./normalize/text-normalizer";
import type { CodeLanguage, DocKind, Posting, Token } from "./types";

export interface FingerprintOptions {
  /** Mặc định `PLAGIARISM_ALGO_VERSION`; quyết định seed băm (be.md §5.1 bước 5). */
  algoVersion?: number;
  /** Ghi đè k/cửa sổ (mặc định theo loại tài liệu: văn bản 5/4, mã 12/8). */
  params?: { k: number; window: number };
  /** Mặc định 20.000 (`fingerprintsPerDocMax`). */
  fingerprintsPerDocMax?: number;
}

export interface TextFingerprintOptions extends FingerprintOptions {
  /** Cụm câu mẫu admin khai (`SystemConfig plagiarism.boilerplatePhrases`) — chỉ áp cho văn bản. */
  boilerplatePhrases?: readonly string[];
}

export interface DocumentFingerprintData {
  kind: DocKind;
  k: number;
  window: number;
  algoVersion: number;
  /** Token SAU lọc (cùng danh sách đã băm): `tokens[i].start/end` = offset ký tự của token thứ i → `tokenOffsets` của tệp dẫn xuất. */
  tokens: Token[];
  /** Mọi fingerprint (hash, vị trí token) → `postings` của tệp dẫn xuất. */
  postings: Posting[];
  /** Tập hash khác nhau, tăng dần, ≤ `fingerprintsPerDocMax` → `DocumentFingerprint.hashes`. */
  hashes: number[];
  /** `true` khi phải cắt `hashes` cho vừa trần (chỉ so một phần tài liệu). */
  truncated: boolean;
}

/** Từ dãy token đã chuẩn hoá → k-gram → murmur3 → winnowing → tập hash. Không I/O, tất định. */
export function fingerprintTokens(tokens: Token[], kind: DocKind, options: FingerprintOptions = {}): DocumentFingerprintData {
  const { k, window } = options.params ?? PLAGIARISM_DEFAULTS[kind === "TEXT" ? "text" : "code"];
  const algoVersion = options.algoVersion ?? PLAGIARISM_ALGO_VERSION;
  const seed = hashSeedForAlgo(algoVersion);
  const postings = winnow(
    kgramHashes(
      tokens.map((t) => t.value),
      k,
      seed,
    ),
    window,
  );
  const { hashes, truncated } = distinctSortedHashes(postings, options.fingerprintsPerDocMax ?? PLAGIARISM_DEFAULTS.fingerprintsPerDocMax);
  return { kind, k, window, algoVersion, tokens, postings, hashes, truncated };
}

/** Văn bản thường: chuẩn hoá + tách từ → (bỏ cụm câu mẫu) → fingerprint. */
export function fingerprintText(text: string, options: TextFingerprintOptions = {}): DocumentFingerprintData {
  const tokens = removeBoilerplatePhrases(tokenizeText(text), options.boilerplatePhrases ?? []);
  return fingerprintTokens(tokens, "TEXT", options);
}

/** Mã nguồn: lexer theo họ ngôn ngữ (bỏ chú thích, định danh → I, chuỗi/số → L) → fingerprint. */
export function fingerprintCode(source: string, language: CodeLanguage, options: FingerprintOptions = {}): DocumentFingerprintData {
  return fingerprintTokens(tokenizeCode(source, language), "CODE", options);
}
