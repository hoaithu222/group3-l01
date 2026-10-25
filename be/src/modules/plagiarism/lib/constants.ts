/**
 * Tham số mặc định của thư viện quét trùng lặp nội bộ (p7-05) — chỉ là HÀM THUẦN, chưa nối `LIMITS`.
 *
 * Các khoá trùng tên với `LIMITS.plagiarism` trong README §7 (text/code/fingerprintsPerDocMax/candidateSourcesMax/
 * minPairPercent/minSectionTokens/mergeGapTokens/sectionsPerTargetMax/commonDocFrequencyPercent/commonDocMinCount/
 * thresholds/charsMax) giữ ĐÚNG số của kế hoạch; khi `LIMITS.plagiarism` được thêm, service truyền tham số từ đó vào
 * các hàm và hằng này chỉ còn là mặc định cho test. Nhóm "riêng của thư viện" (cuối object) chưa có trong kế hoạch.
 */

/**
 * Phiên bản thuật toán (đổi cách chuẩn hoá/tách token/băm/winnowing → tăng số này để reindex toàn bộ, vì fingerprint cũ
 * và mới không so được với nhau). Test "golden" trong `pipeline.test.ts` sẽ đỏ nếu ai đổi thuật toán mà quên tăng.
 */
export const PLAGIARISM_ALGO_VERSION = 1;

export const PLAGIARISM_DEFAULTS = {
  /** Văn bản: k = 5 từ, cửa sổ 4 → bắt mọi đoạn trùng ≥ 4 + 5 − 1 = 8 từ. */
  text: { k: 5, window: 4 },
  /** Mã nguồn: k = 12 token, cửa sổ 8 → bắt mọi đoạn trùng ≥ 8 + 12 − 1 = 19 token. */
  code: { k: 12, window: 8 },
  fingerprintsPerDocMax: 20_000,
  candidateSourcesMax: 50,
  /** `PlagiarismResult.matchedSources` chỉ giữ ≤ 10 nguồn trùng nhiều nhất (README §4). */
  matchedSourcesMax: 10,
  minPairPercent: 5,
  minSectionTokens: 15,
  mergeGapTokens: 10,
  sectionsPerTargetMax: 200,
  commonDocFrequencyPercent: 30,
  commonDocMinCount: 5,
  thresholds: { medium: 20, high: 40 },
  charsMax: 1_000_000,

  // ── Riêng của thư viện (chưa có trong LIMITS của kế hoạch) ──
  /** k-gram lặp quá số lần này ở MỘT trong hai tài liệu (bảng biểu, "a a a a…") bị bỏ khi ghép cặp vị trí — tránh bùng nổ tích Descartes. */
  maxOccurrencesPerHash: 16,
  /** Trần tổng số cặp vị trí khớp của một cặp tài liệu (đủ rộng cho tài liệu 1 triệu ký tự; chỉ chặn ca bệnh lý). */
  maxMatchPairs: 200_000,
  /** Dòng đầu/cuối trang lặp ở ≥ 50 % số trang (và ≥ 2 trang) bị coi là header/footer (README §2). */
  headerFooterMinPageRatio: 0.5,
  /** Chỉ xét header/footer trong 3 dòng đầu và 3 dòng cuối mỗi trang — dòng thân bài lặp lại không bị xoá nhầm. */
  headerFooterEdgeLines: 3,
  /** PDF: tỉ lệ ký tự chữ/số hợp lệ < 60 % hoặc < 50 từ → `NO_TEXT` (be.md §5.1 bước 3). */
  minValidCharRatio: 0.6,
  minPdfWords: 50,
} as const;
