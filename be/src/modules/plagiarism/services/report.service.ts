import { LIMITS } from "../../../core/constants/limits";
import { ScopeNotFoundError } from "../../../core/exceptions";
import type { CursorResponse } from "../../../core/utils/response";
import { readDerivedDocument } from "../lib/derived-store";
import { plagiarismErrors } from "../plagiarism.errors";
import type { IFingerprintRepository } from "../repositories/fingerprint.repository";
import type { IResourceReadRepository } from "../repositories/resource-read.repository";
import type { IResultRepository, ResultRow } from "../repositories/result.repository";
import type { IPlagiarismSectionRepository, SectionRow } from "../repositories/section.repository";
import type { IScanRepository, ScanRow } from "../repositories/scan.repository";

/** Câu cố định trên mọi màn/tệp xuất (be.md §2, README §8 mục 5). */
export const PLAGIARISM_DISCLAIMER = "Kết quả là gợi ý để đối chiếu, không phải kết luận về đạo văn.";

const NOT_READY_STATUSES = new Set(["QUEUED", "INDEXING", "SCANNING"]);

export interface PairScoreDto {
  a: string;
  b: string;
  aInB: number;
  bInA: number;
}

export interface ReportDto {
  scan: ScanRow;
  disclaimer: string;
  results: ResultRow[];
  pairs?: PairScoreDto[];
}

export type Excerpt =
  | {
      resourceId: string;
      name: string;
      kind: string | null;
      language: string | null;
      lineStart: number;
      lineEnd: number;
      text: string;
      highlights: Array<{ from: number; to: number }>;
      stale: boolean;
    }
  | { unavailable: true; reason: "DELETED" | "NO_ACCESS" };

export interface ContextDto {
  left: Excerpt;
  right: Excerpt;
}

export interface ReportServiceDeps {
  scans: IScanRepository;
  results: IResultRepository;
  sections: IPlagiarismSectionRepository;
  fingerprints: IFingerprintRepository;
  resources: IResourceReadRepository;
  now?: () => Date;
}

/** Báo cáo, đoạn trùng, `context` (be.md §5.4). */
export class ReportService {
  private readonly now: () => Date;

  constructor(private readonly d: ReportServiceDeps) {
    this.now = d.now ?? (() => new Date());
  }

  private async requireReportable(scanId: string): Promise<ScanRow> {
    const scan = await this.d.scans.findById(scanId);
    if (!scan || scan.deletedAt) throw new ScopeNotFoundError();
    if (NOT_READY_STATUSES.has(scan.status)) throw plagiarismErrors.scanNotReady();
    if (scan.status === "EXPIRED" || scan.expiresAt <= this.now()) throw plagiarismErrors.reportExpired();
    return scan;
  }

  async report(scanId: string): Promise<ReportDto> {
    const scan = await this.requireReportable(scanId);
    const results = await this.d.results.listByScan(scanId);
    let pairs: PairScoreDto[] | undefined;
    if (scan.mode === "WITHIN_SELECTION") {
      pairs = [];
      const byTarget = new Map(results.map((r) => [r.targetResourceId, r]));
      const ids = scan.targetResourceIds;
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const a = ids[i];
          const b = ids[j];
          const aInB = byTarget.get(a)?.matchedSources.find((m) => m.resourceId === b)?.similarity ?? 0;
          const bInA = byTarget.get(b)?.matchedSources.find((m) => m.resourceId === a)?.similarity ?? 0;
          pairs.push({ a, b, aInB, bInA });
        }
      }
    }
    return { scan, disclaimer: PLAGIARISM_DISCLAIMER, results, ...(pairs && { pairs }) };
  }

  async sections(params: { scanId: string; targetResourceId: string; cursor?: string; limit: number; sourceResourceId?: string }): Promise<
    CursorResponse<SectionRow & { sourceName: string }>
  > {
    await this.requireReportable(params.scanId);
    const page = await this.d.sections.listByTarget(params);
    const names = await this.d.resources.findManyByIds([...new Set(page.data.map((s) => s.sourceResourceId))]);
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    return { data: page.data.map((s) => ({ ...s, sourceName: nameById.get(s.sourceResourceId) ?? "" })), meta: page.meta };
  }

  async context(scanId: string, sectionId: string): Promise<ContextDto> {
    const scan = await this.requireReportable(scanId);
    const section = await this.d.sections.findById(scanId, sectionId);
    if (!section) throw new ScopeNotFoundError();
    void scan;
    const [left, right] = await Promise.all([
      this.excerptFor(section.targetResourceId, section.target),
      this.excerptFor(section.sourceResourceId, section.source),
    ]);
    return { left, right };
  }

  private async excerptFor(resourceId: string, span: SectionRow["target"]): Promise<Excerpt> {
    const resource = await this.d.resources.findById(resourceId);
    if (!resource || resource.deletedAt) return { unavailable: true, reason: "DELETED" };
    const fp = await this.d.fingerprints.findByResourceId(resourceId);
    if (!fp || fp.status !== "READY" || !fp.derivedKey) return { unavailable: true, reason: "DELETED" };
    const doc = await readDerivedDocument(fp.derivedKey);
    if (!doc) return { unavailable: true, reason: "DELETED" };

    const contextChars = LIMITS.plagiarism.contextChars;
    const excerptMax = LIMITS.plagiarism.excerptCharsMax;
    let from = Math.max(0, span.startChar - contextChars);
    let to = Math.min(doc.text.length, span.endChar + contextChars);
    if (to - from > excerptMax) {
      const over = to - from - excerptMax;
      from = Math.min(span.startChar, from + Math.floor(over / 2));
      to = Math.max(span.endChar, to - Math.ceil(over / 2));
    }
    const text = doc.text.slice(from, to);
    return {
      resourceId,
      name: resource.name,
      kind: fp.kind,
      language: fp.language,
      lineStart: span.lineStart,
      lineEnd: span.lineEnd,
      text,
      highlights: [{ from: Math.max(0, span.startChar - from), to: Math.min(text.length, span.endChar - from) }],
      // Điểm mở CHƯA làm: be.md muốn `stale: true` khi `resourceVersion` đã đổi so với LÚC QUÉT — `PlagiarismScan`/
      // `PlagiarismSection` không lưu phiên bản tài liệu tại thời điểm quét nên không so được ở đây (xem báo cáo cuối).
      stale: false,
    };
  }
}
