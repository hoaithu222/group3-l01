import { LIMITS } from "../../../core/constants/limits";
import { createContextLogger } from "../../../infrastructure/logger";
import { enqueue, toSafeJobId, type QueueName } from "../../../infrastructure/queue";
import { PLAGIARISM_ALGO_VERSION } from "../lib/constants";
import { deleteDerivedDocument, derivedStoreKey, postingsToTuples, writeDerivedDocument } from "../lib/derived-store";
import { classifyFileName, getTextExtractor } from "../lib/extract/extractor.registry";
import { assessTextQuality } from "../lib/extract/text-quality";
import { fingerprintCode, fingerprintText } from "../lib/pipeline";
import type { IFingerprintRepository } from "../repositories/fingerprint.repository";
import type { IResourceReadRepository, ResourceInfo } from "../repositories/resource-read.repository";
import type { IPlagiarismAssetReader } from "./asset-reader";
import type { PlagiarismConfigService } from "./plagiarism-config.service";

const log = createContextLogger({ service: "PlagiarismFingerprintIndex" });

export const PLAGIARISM_FINGERPRINT_QUEUE: QueueName = "media";
export const PLAGIARISM_FINGERPRINT_JOB = "plagiarism.fingerprint";
export const PLAGIARISM_FINGERPRINT_PURGE_JOB = "plagiarism.fingerprint-purge";

export function fingerprintJobId(resourceId: string, resourceVersion: number, algoVersion: number = PLAGIARISM_ALGO_VERSION): string {
  return toSafeJobId(`plagiarism.fingerprint:resource:${resourceId}:v${resourceVersion}:a${algoVersion}`);
}

export function fingerprintPurgeJobId(resourceId: string): string {
  return toSafeJobId(`plagiarism.fingerprint-purge:resource:${resourceId}`);
}

/** Offset ký tự (0-based) của mọi "\n" trong `text`, tăng dần — mảng `lineBreaks` của tệp dẫn xuất. */
function buildLineBreaks(text: string): number[] {
  const out: number[] = [];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) out.push(i);
  return out;
}

export interface FingerprintIndexDeps {
  fingerprints: IFingerprintRepository;
  resources: IResourceReadRepository;
  assets: IPlagiarismAssetReader;
  config: PlagiarismConfigService;
}

/**
 * Lập chỉ mục dấu vân tay của MỘT `Resource` (be.md §5.1). Gọi từ hai nơi: `resource-events.listener.ts` (khi tài liệu
 * mới/đổi nội dung → `upsertOnChange` rồi xếp hàng `runIndexJob`) và job `plagiarism.fingerprint` (chạy `runIndexJob`
 * thật). Tách hai bước để listener không cần biết chi tiết trích chữ/băm — chỉ quyết định "tệp này có cần lập chỉ mục
 * không" từ tên/đuôi tệp.
 */
export class FingerprintIndexService {
  constructor(private readonly d: FingerprintIndexDeps) {}

  /** `resource.created|updated` (nội dung mới hoặc đổi phiên bản) — tạo/đưa fingerprint về PENDING rồi xếp job. */
  async upsertOnChange(resource: Pick<ResourceInfo, "id" | "workspaceId" | "name" | "assetId" | "version">): Promise<void> {
    const classification = classifyFileName(resource.name);
    if (!classification.supported) {
      await this.d.fingerprints.markUnsupported({
        resourceId: resource.id,
        workspaceId: resource.workspaceId,
        resourceVersion: resource.version,
        assetId: resource.assetId,
        algoVersion: PLAGIARISM_ALGO_VERSION,
      });
      return;
    }
    await this.d.fingerprints.upsertPending({
      resourceId: resource.id,
      workspaceId: resource.workspaceId,
      resourceVersion: resource.version,
      assetId: resource.assetId,
      algoVersion: PLAGIARISM_ALGO_VERSION,
    });
    await enqueue(
      PLAGIARISM_FINGERPRINT_QUEUE,
      PLAGIARISM_FINGERPRINT_JOB,
      { resourceId: resource.id, resourceVersion: resource.version },
      { jobId: fingerprintJobId(resource.id, resource.version) }
    );
  }

  /**
   * `resource-events.listener.ts` cho sự kiện `resource.created|updated` — tự tra lại `Resource` hiện tại (payload outbox
   * không có tên/đuôi tệp) rồi quyết định: đã xoá → `markDeleted`; còn sống → `markRestored` (idempotent, bao luôn ca
   * khôi phục từ thùng rác) + chỉ xếp job lập chỉ mục lại khi `assetId` đổi (đổi tên/di chuyển/gắn nhãn không đổi nội
   * dung tệp — bỏ qua để không lập chỉ mục lại vô ích).
   */
  async handleResourceChanged(resourceId: string): Promise<void> {
    const resource = await this.d.resources.findById(resourceId);
    if (!resource || resource.deletedAt) {
      await this.markDeleted(resourceId);
      return;
    }
    await this.markRestored(resourceId);
    const existing = await this.d.fingerprints.findByResourceId(resourceId);
    if (existing && existing.assetId === resource.assetId && existing.status === "READY") return;
    await this.upsertOnChange(resource);
  }

  /** `resource.deleted` (vào thùng rác) — loại khỏi so khớp NGAY, không xoá fingerprint (khôi phục dùng lại được). */
  async markDeleted(resourceId: string): Promise<void> {
    await this.d.fingerprints.markResourceDeleted(resourceId, true);
  }

  /** `resource.updated` với `deletedAt: null` (khôi phục từ thùng rác). */
  async markRestored(resourceId: string): Promise<void> {
    await this.d.fingerprints.markResourceDeleted(resourceId, false);
  }

  /** `resource.purged` (xoá vĩnh viễn) — job `plagiarism.fingerprint-purge`. */
  async purge(resourceId: string): Promise<void> {
    const row = await this.d.fingerprints.deleteByResourceId(resourceId);
    if (row?.derivedKey) await deleteDerivedDocument(row.derivedKey);
  }

  /**
   * Job `plagiarism.fingerprint` (be.md §5.1 bước 2–6). CAS: bản ghi phải còn `PENDING` VÀ đúng `resourceVersion` —
   * bản mới hơn đã tới (job kế tiếp xử lý) hoặc đã lập chỉ mục xong (retry trùng) → bỏ qua êm.
   */
  async runIndexJob(resourceId: string, resourceVersion: number): Promise<void> {
    const fp = await this.d.fingerprints.findByResourceId(resourceId);
    if (!fp || fp.status !== "PENDING" || fp.resourceVersion !== resourceVersion) return;

    const resource = await this.d.resources.findById(resourceId);
    if (!resource || resource.deletedAt) {
      await this.d.fingerprints.markResourceDeleted(resourceId, true);
      return;
    }
    if (resource.size > LIMITS.plagiarism.fileBytesMax) {
      await this.d.fingerprints.markStatus(resourceId, "TOO_LARGE", null);
      return;
    }
    const classification = classifyFileName(resource.name);
    if (!classification.supported) {
      await this.d.fingerprints.markStatus(resourceId, "UNSUPPORTED", null);
      return;
    }

    const content = await this.d.assets.read(resource.assetId);
    if (!content) {
      // Asset chưa READY/đã mất — không phải lỗi tất định của TỆP, để job retry (BullMQ) bắt lại khi asset sẵn sàng.
      throw new Error(`[plagiarism.fingerprint] Asset ${resource.assetId} của resource ${resourceId} chưa đọc được`);
    }

    const extractor = getTextExtractor(classification.extractor);
    const extraction = await extractor.extract({ buffer: content.buffer, charsMax: LIMITS.plagiarism.charsMax });
    if (!extraction.ok) {
      await this.d.fingerprints.markStatus(resourceId, extraction.reason, null);
      return;
    }
    if (classification.extractor === "pdf" && !assessTextQuality(extraction.text).ok) {
      await this.d.fingerprints.markStatus(resourceId, "NO_TEXT", null);
      return;
    }

    const cfg = await this.d.config.current();
    const fpData =
      classification.kind === "TEXT"
        ? fingerprintText(extraction.text, {
            algoVersion: PLAGIARISM_ALGO_VERSION,
            params: LIMITS.plagiarism.text,
            fingerprintsPerDocMax: LIMITS.plagiarism.fingerprintsPerDocMax,
            boilerplatePhrases: cfg.boilerplatePhrases,
          })
        : fingerprintCode(extraction.text, classification.language, {
            algoVersion: PLAGIARISM_ALGO_VERSION,
            params: LIMITS.plagiarism.code,
            fingerprintsPerDocMax: LIMITS.plagiarism.fingerprintsPerDocMax,
          });

    const derivedKey = derivedStoreKey(resource.workspaceId, resourceId, resourceVersion, PLAGIARISM_ALGO_VERSION);
    await writeDerivedDocument(derivedKey, {
      algoVersion: PLAGIARISM_ALGO_VERSION,
      kind: classification.kind,
      text: extraction.text,
      tokenOffsets: fpData.tokens.map((t): [number, number] => [t.start, t.end]),
      lineBreaks: buildLineBreaks(extraction.text),
      postings: postingsToTuples(fpData.postings),
    });

    const previousDerivedKey = fp.derivedKey;
    await this.d.fingerprints.markReady(resourceId, {
      algoVersion: PLAGIARISM_ALGO_VERSION,
      kind: classification.kind,
      language: classification.kind === "CODE" ? classification.language : null,
      tokenCount: fpData.tokens.length,
      hashCount: fpData.hashes.length,
      hashes: fpData.hashes,
      truncated: fpData.truncated || extraction.truncated,
      derivedKey,
    });

    if (previousDerivedKey && previousDerivedKey !== derivedKey) {
      await deleteDerivedDocument(previousDerivedKey).catch((err: unknown) =>
        log.warn("Chưa xoá được tệp dẫn xuất phiên bản cũ", { resourceId, error: err instanceof Error ? err.message : String(err) })
      );
    }
  }
}
