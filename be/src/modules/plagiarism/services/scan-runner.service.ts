import type { FingerprintKind, PlagiarismScanStatus } from "@prisma/client";
import { LIMITS } from "../../../core/constants/limits";
import { createContextLogger } from "../../../infrastructure/logger";
import { enqueue } from "../../../infrastructure/queue";
import { notify } from "../../notifications/public";
import { PLAGIARISM_DEFAULTS } from "../lib/constants";
import { readDerivedDocument } from "../lib/derived-store";
import { commonHashSet, effectiveHashes, scoreTarget, unionHashes, type SourceHashes } from "../lib/match/containment";
import { buildSections, limitSections, type TokenSection } from "../lib/match/section-merger";
import { lineNumberAt } from "../lib/match/span-range";
import type { Posting, SpanRange } from "../lib/types";
import { PLAGIARISM_NOTIFICATION_TYPES, PLAGIARISM_SCAN_JOB, PLAGIARISM_SCAN_QUEUE, scanJobId } from "../plagiarism.events";
import type { CandidateFingerprint, FingerprintRow, IFingerprintRepository } from "../repositories/fingerprint.repository";
import type { IResourceReadRepository, ResourceInfo } from "../repositories/resource-read.repository";
import type { CreateSectionInput, IPlagiarismSectionRepository } from "../repositories/section.repository";
import type { IResultRepository, MatchedSourceRow } from "../repositories/result.repository";
import type { IScanRepository, ScanRow } from "../repositories/scan.repository";
import type { ITxRunner } from "../repositories/tx";
import type { IScanEmitter } from "./scan-emitter";

const log = createContextLogger({ service: "PlagiarismScanRunner" });

const HASH_BATCH = 1000;
const EMIT_THROTTLE_MS = 2000;

interface TaggedSection extends TokenSection {
  sourceResourceId: string;
}

/** `lineStarts` (mẫu `lib/match/span-range.ts`) dựng từ `lineBreaks` của tệp dẫn xuất (offset các "\n"). */
function lineStartsFromBreaks(lineBreaks: readonly number[]): number[] {
  return [0, ...lineBreaks.map((b) => b + 1)];
}

function spanFromOffsets(offsets: ReadonlyArray<[number, number]>, lineStarts: readonly number[], start: number, end: number): SpanRange {
  const clampedEnd = Math.min(end, offsets.length);
  const startChar = offsets[start][0];
  const endChar = offsets[clampedEnd - 1][1];
  return {
    startToken: start,
    endToken: clampedEnd,
    startChar,
    endChar,
    lineStart: lineNumberAt(lineStarts, startChar),
    lineEnd: lineNumberAt(lineStarts, Math.max(startChar, endChar - 1)),
  };
}

function toPostings(tuples: ReadonlyArray<[number, number]>): Posting[] {
  return tuples.map(([hash, pos]) => ({ hash, pos }));
}

const SKIP_REASON_BY_STATUS: Record<string, string> = { NO_TEXT: "NO_TEXT", UNSUPPORTED: "UNSUPPORTED", TOO_LARGE: "TOO_LARGE", FAILED: "FAILED", PENDING: "FAILED" };

export interface ScanRunnerDeps {
  scans: IScanRepository;
  fingerprints: IFingerprintRepository;
  resources: IResourceReadRepository;
  results: IResultRepository;
  sections: IPlagiarismSectionRepository;
  tx: ITxRunner;
  emitter: IScanEmitter;
  now?: () => Date;
}

interface RunConfig {
  thresholds: { medium: number; high: number };
  minSectionTokens: number;
  mergeGapTokens: number;
  minPairPercent: number;
  candidateSourcesMax: number;
  sectionsPerTargetMax: number;
  commonDocFrequencyPercent: number;
  commonDocMinCount: number;
  text: { k: number; window: number };
  code: { k: number; window: number };
}

function readConfig(snapshot: unknown): RunConfig {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  const num = (key: string, fallback: number): number => (typeof s[key] === "number" ? (s[key] as number) : fallback);
  return {
    thresholds: (s["thresholds"] as RunConfig["thresholds"] | undefined) ?? LIMITS.plagiarism.thresholds,
    minSectionTokens: num("minSectionTokens", LIMITS.plagiarism.minSectionTokens),
    mergeGapTokens: num("mergeGapTokens", LIMITS.plagiarism.mergeGapTokens),
    minPairPercent: num("minPairPercent", LIMITS.plagiarism.minPairPercent),
    candidateSourcesMax: num("candidateSourcesMax", LIMITS.plagiarism.candidateSourcesMax),
    sectionsPerTargetMax: num("sectionsPerTargetMax", LIMITS.plagiarism.sectionsPerTargetMax),
    commonDocFrequencyPercent: num("commonDocFrequencyPercent", LIMITS.plagiarism.commonDocFrequencyPercent),
    commonDocMinCount: num("commonDocMinCount", LIMITS.plagiarism.commonDocMinCount),
    text: (s["text"] as RunConfig["text"] | undefined) ?? LIMITS.plagiarism.text,
    code: (s["code"] as RunConfig["code"] | undefined) ?? LIMITS.plagiarism.code,
  };
}

/**
 * Chạy MỘT lượt quét (job `plagiarism.scan`, be.md §5.3). Lệch kiến trúc CÓ CHỦ Ý so với be.md ở hai điểm, cả hai đều
 * do giới hạn của `registerJob()` dùng chung (`infrastructure/queue/worker.ts` chỉ chuyển `job` cho processor, KHÔNG
 * chuyển `token` mà BullMQ cấp — thiếu token thì không gọi được `job.moveToDelayed()`):
 *  1. "Chờ lập chỉ mục" (bước 1): thay vì hoãn CHÍNH job đang chạy, tự xếp một job MỚI (jobId khác, delay 30 s) rồi kết
 *     thúc job hiện tại BÌNH THƯỜNG (không lỗi) — cùng hiệu quả (chờ tới `indexWaitMaxMinutes` rồi `FAILED
 *     INDEX_TIMEOUT`), khác ở chỗ BullMQ thấy nhiều job "hoàn tất" nối tiếp nhau thay vì một job bị hoãn.
 *  2. Ghi kết quả mỗi đích (bước 7) KHÔNG bọc trong MỘT transaction Mongo (repo `result`/`section` dùng client Prisma
 *     thường, không nhận `tx`) — vẫn IDEMPOTENT khi retry (`deleteByTarget` rồi `createMany` lại từ đầu), chỉ mất tính
 *     "tất cả hoặc không gì" nếu job crash ĐÚNG giữa hai lệnh (repo tự sửa ở lượt chạy lại kế tiếp).
 */
export class ScanRunnerService {
  private readonly now: () => Date;

  constructor(private readonly d: ScanRunnerDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async run(scanId: string): Promise<void> {
    let scan = await this.d.scans.findById(scanId);
    if (!scan || scan.deletedAt) return;
    if (scan.status === "CANCELLED" || scan.status === "COMPLETED" || scan.status === "FAILED" || scan.status === "EXPIRED") return;

    if (scan.status === "QUEUED") {
      const updated = await this.d.scans.updateIfStatus(scanId, ["QUEUED"], { status: "INDEXING", startedAt: this.now() });
      scan = updated ?? (await this.d.scans.findById(scanId)) ?? scan;
      if (updated) this.d.emitter.scanUpdated(scan);
    }
    if (scan.status !== "INDEXING" && scan.status !== "SCANNING") return;

    if (scan.status === "INDEXING") {
      const targetFps = await this.d.fingerprints.findManyByResourceIds(scan.targetResourceIds);
      const byId = new Map(targetFps.map((f) => [f.resourceId, f]));
      const stillPending = scan.targetResourceIds.some((id) => byId.get(id)?.status === "PENDING" || !byId.has(id));
      if (stillPending) {
        const elapsedMin = (this.now().getTime() - scan.createdAt.getTime()) / 60_000;
        if (elapsedMin > LIMITS.plagiarism.indexWaitMaxMinutes) {
          await this.finish(scan, "FAILED", "INDEX_TIMEOUT");
          return;
        }
        await enqueue(PLAGIARISM_SCAN_QUEUE, PLAGIARISM_SCAN_JOB, { scanId }, { jobId: `${scanJobId(scanId)}_wait${Date.now()}`, delay: 30_000 });
        return;
      }
      const updated = await this.d.scans.updateIfStatus(scanId, ["INDEXING"], { status: "SCANNING" });
      scan = updated ?? scan;
      if (updated) this.d.emitter.scanUpdated(scan);
    }

    await this.runScanning(scan);
  }

  private async finish(scan: ScanRow, status: PlagiarismScanStatus, failureCode: string | null): Promise<void> {
    const updated = await this.d.scans.update(scan.id, { status, failureCode, finishedAt: this.now() });
    this.d.emitter.scanUpdated(updated);
    await this.notifyDone(updated, status === "COMPLETED");
  }

  private async notifyDone(scan: ScanRow, completed: boolean): Promise<void> {
    try {
      await this.d.tx.run((tx) =>
        notify(tx, {
          type: completed ? PLAGIARISM_NOTIFICATION_TYPES.SCAN_COMPLETED : PLAGIARISM_NOTIFICATION_TYPES.SCAN_FAILED,
          scope: { type: "WORKSPACE", id: scan.workspaceId },
          workspaceId: scan.workspaceId,
          source: { type: "PlagiarismScan", id: scan.id },
          refs: { scanId: scan.id, workspaceId: scan.workspaceId },
          recipients: [{ userId: scan.requestedBy }],
          dedupeKey: `plagiarism.scan-done:scan:${scan.id}`,
        })
      );
    } catch (err) {
      log.warn("Không gửi được thông báo kết thúc lượt quét", { scanId: scan.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async runScanning(scan: ScanRow): Promise<void> {
    const cfg = readConfig(scan.configSnapshot);

    const excludeIds = new Set(scan.excludeResourceIds);
    if (scan.excludeFolderIds.length > 0) {
      const inFolders = await this.d.resources.listResourceIdsInFolders(scan.workspaceId, scan.excludeFolderIds);
      inFolders.forEach((id) => excludeIds.add(id));
    }
    const excludedFps = excludeIds.size > 0 ? await this.d.fingerprints.findManyByResourceIds([...excludeIds]) : [];
    const hExcl = unionHashes(excludedFps.map((f) => f.hashes));

    const targetFps = await this.d.fingerprints.findManyByResourceIds(scan.targetResourceIds);
    const fpByResource = new Map(targetFps.map((f) => [f.resourceId, f]));
    const targetResources = await this.d.resources.findManyByIds(scan.targetResourceIds);
    const resourceById = new Map(targetResources.map((r) => [r.id, r]));

    const kinds = new Set(targetFps.filter((f) => f.status === "READY" && f.kind).map((f) => f.kind as FingerprintKind));
    const commonByKind = new Map<FingerprintKind, Set<number>>();
    for (const kind of kinds) {
      const allHashes = [...new Set(targetFps.filter((f) => f.kind === kind).flatMap((f) => f.hashes))];
      const docFreq = new Map<number, number>();
      for (let i = 0; i < allHashes.length; i += HASH_BATCH) {
        const part = await this.d.fingerprints.docFrequency({ workspaceId: scan.workspaceId, kind, hashBatch: allHashes.slice(i, i + HASH_BATCH) });
        part.forEach((v, h) => docFreq.set(h, v));
      }
      const totalDocs = await this.d.fingerprints.countReadyByKind(scan.workspaceId, kind);
      commonByKind.set(kind, commonHashSet(docFreq, totalDocs, { minCount: cfg.commonDocMinCount, frequencyPercent: cfg.commonDocFrequencyPercent }));
    }

    let anyOk = false;
    let lastEmit = 0;
    for (let i = 0; i < scan.targetResourceIds.length; i += 1) {
      const targetId = scan.targetResourceIds[i];
      const stillScanning = await this.d.scans.findById(scan.id);
      if (!stillScanning || stillScanning.status !== "SCANNING") return; // huỷ giữa chừng (be.md §5.3 bước 5)

      const fp = fpByResource.get(targetId);
      const resource = resourceById.get(targetId);
      const ok = await this.processTarget(scan, targetId, resource?.name ?? "", resource, fp, {
        excludeIds,
        hExcl,
        commonByKind,
        cfg,
      });
      if (ok) anyOk = true;

      const progress = Math.round(((i + 1) / scan.targetResourceIds.length) * 100);
      const nowMs = Date.now();
      const isLast = i === scan.targetResourceIds.length - 1;
      if (isLast || nowMs - lastEmit >= EMIT_THROTTLE_MS) {
        lastEmit = nowMs;
        const updated = await this.d.scans.update(scan.id, { progress });
        this.d.emitter.scanUpdated(updated);
      } else {
        await this.d.scans.update(scan.id, { progress });
      }
    }

    await this.finish(scan, anyOk ? "COMPLETED" : "FAILED", anyOk ? null : "ALL_TARGETS_SKIPPED");
  }

  private async processTarget(
    scan: ScanRow,
    targetId: string,
    targetName: string,
    resource: ResourceInfo | undefined,
    fp: FingerprintRow | undefined,
    ctx: { excludeIds: ReadonlySet<string>; hExcl: ReadonlySet<number>; commonByKind: ReadonlyMap<FingerprintKind, Set<number>>; cfg: RunConfig }
  ): Promise<boolean> {
    const isDeleted = !resource || resource.deletedAt !== null || fp?.resourceDeleted === true;
    if (isDeleted || !fp || fp.status !== "READY" || !fp.kind || !fp.derivedKey) {
      const skipReason = isDeleted ? "DELETED" : SKIP_REASON_BY_STATUS[fp?.status ?? "FAILED"] ?? "FAILED";
      await this.writeSkipped(scan.id, targetId, targetName, fp?.kind ?? null, skipReason);
      return false;
    }

    const targetHashes = new Set(fp.hashes);
    const common = ctx.commonByKind.get(fp.kind) ?? new Set<number>();
    const effective = effectiveHashes(targetHashes, { excluded: ctx.hExcl, common });
    if (effective.size === 0) {
      await this.writeSkipped(scan.id, targetId, targetName, fp.kind, "NO_TEXT");
      return false;
    }

    const candidates = await this.findCandidates(scan, targetId, fp.kind, effective, ctx.excludeIds);
    const sources: SourceHashes[] = candidates.map((c) => ({ id: c.resourceId, hashes: c.hashes }));
    const scored = scoreTarget(effective, sources, {
      minPairPercent: ctx.cfg.minPairPercent,
      candidateSourcesMax: ctx.cfg.candidateSourcesMax,
      thresholds: ctx.cfg.thresholds,
    });

    const kept = scored.sources.slice(0, PLAGIARISM_DEFAULTS.matchedSourcesMax);
    const names = kept.length > 0 ? await this.d.resources.findManyByIds(kept.map((s) => s.id)) : [];
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    const matchedSources: MatchedSourceRow[] = kept.map((s) => ({ resourceId: s.id, nameSnapshot: nameById.get(s.id) ?? "", similarity: s.similarity }));

    const sectionRows = await this.buildSectionRows(scan.id, targetId, fp.derivedKey, kept, candidates, effective, fp.kind, ctx.cfg);

    await this.d.sections.deleteByTarget(scan.id, targetId);
    if (sectionRows.length > 0) await this.d.sections.createMany(sectionRows);
    await this.d.results.upsert({
      scanId: scan.id,
      targetResourceId: targetId,
      targetName,
      kind: fp.kind,
      status: "OK",
      skipReason: null,
      score: scored.score,
      level: scored.level,
      matchedSources,
      sectionCount: sectionRows.length,
    });
    return true;
  }

  private async writeSkipped(scanId: string, targetId: string, targetName: string, kind: FingerprintKind | null, skipReason: string): Promise<void> {
    await this.d.sections.deleteByTarget(scanId, targetId);
    await this.d.results.upsert({
      scanId,
      targetResourceId: targetId,
      targetName,
      kind,
      status: "SKIPPED",
      skipReason,
      score: 0,
      level: null,
      matchedSources: [],
      sectionCount: 0,
    });
  }

  private async findCandidates(
    scan: ScanRow,
    targetId: string,
    kind: FingerprintKind,
    effective: ReadonlySet<number>,
    excludeIds: ReadonlySet<string>
  ): Promise<CandidateFingerprint[]> {
    if (scan.mode === "WITHIN_SELECTION") {
      const others = await this.d.fingerprints.findManyByResourceIds(scan.targetResourceIds.filter((id) => id !== targetId));
      return others
        .filter((f) => f.status === "READY" && f.kind === kind && !f.resourceDeleted && !excludeIds.has(f.resourceId))
        .map((f) => ({ resourceId: f.resourceId, hashes: f.hashes, derivedKey: f.derivedKey }));
    }
    const hashBatchExclude = new Set([...excludeIds, targetId]);
    const byId = new Map<string, CandidateFingerprint>();
    const hashes = [...effective];
    for (let i = 0; i < hashes.length; i += HASH_BATCH) {
      const rows = await this.d.fingerprints.findCandidatesByHashes({
        workspaceId: scan.workspaceId,
        kind,
        hashBatch: hashes.slice(i, i + HASH_BATCH),
        excludeResourceIds: [...hashBatchExclude],
      });
      for (const r of rows) byId.set(r.resourceId, r);
    }
    return [...byId.values()];
  }

  private async buildSectionRows(
    scanId: string,
    targetId: string,
    targetDerivedKey: string,
    kept: { id: string; similarity: number }[],
    candidates: CandidateFingerprint[],
    effective: ReadonlySet<number>,
    kind: FingerprintKind,
    cfg: RunConfig
  ): Promise<CreateSectionInput[]> {
    if (kept.length === 0) return [];
    const targetDoc = await readDerivedDocument(targetDerivedKey);
    if (!targetDoc) return [];
    const targetLineStarts = lineStartsFromBreaks(targetDoc.lineBreaks);
    const targetPostings = toPostings(targetDoc.postings);
    const k = kind === "TEXT" ? cfg.text.k : cfg.code.k;

    const candidateByResource = new Map(candidates.map((c) => [c.resourceId, c]));
    const all: TaggedSection[] = [];
    for (const source of kept) {
      const candidate = candidateByResource.get(source.id);
      if (!candidate?.derivedKey) continue;
      const sourceDoc = await readDerivedDocument(candidate.derivedKey);
      if (!sourceDoc) continue;
      const sections = buildSections(targetPostings, toPostings(sourceDoc.postings), {
        allowedHashes: effective,
        k,
        mergeGapTokens: cfg.mergeGapTokens,
        minSectionTokens: cfg.minSectionTokens,
        sectionsMax: cfg.sectionsPerTargetMax,
      });
      for (const s of sections) all.push({ ...s, sourceResourceId: source.id });
    }
    const limited = limitSections(all, cfg.sectionsPerTargetMax) as TaggedSection[];

    const sourceDocsCache = new Map<string, { offsets: Array<[number, number]>; lineStarts: number[] }>();
    const rows: CreateSectionInput[] = [];
    for (let order = 0; order < limited.length; order += 1) {
      const section = limited[order];
      const candidate = candidateByResource.get(section.sourceResourceId);
      if (!candidate?.derivedKey) continue;
      let sourceInfo = sourceDocsCache.get(section.sourceResourceId);
      if (!sourceInfo) {
        const doc = await readDerivedDocument(candidate.derivedKey);
        if (!doc) continue;
        sourceInfo = { offsets: doc.tokenOffsets, lineStarts: lineStartsFromBreaks(doc.lineBreaks) };
        sourceDocsCache.set(section.sourceResourceId, sourceInfo);
      }
      rows.push({
        scanId,
        targetResourceId: targetId,
        sourceResourceId: section.sourceResourceId,
        order: order + 1,
        target: spanFromOffsets(targetDoc.tokenOffsets, targetLineStarts, section.targetStart, section.targetEnd),
        source: spanFromOffsets(sourceInfo.offsets, sourceInfo.lineStarts, section.sourceStart, section.sourceEnd),
        similarity: section.similarity,
        matchedHashes: section.matchedHashes,
      });
    }
    return rows;
  }
}
