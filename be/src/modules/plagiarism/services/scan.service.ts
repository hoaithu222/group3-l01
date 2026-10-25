import type { PlagiarismScanMode, PlagiarismScanStatus } from "@prisma/client";
import { LIMITS } from "../../../core/constants/limits";
import { ForbiddenError, ScopeNotFoundError } from "../../../core/exceptions";
import { prisma } from "../../../infrastructure/database";
import type { CursorResponse } from "../../../core/utils/response";
import { classifyFileName } from "../lib/extract/extractor.registry";
import { PLAGIARISM_ALGO_VERSION } from "../lib/constants";
import { plagiarismErrors } from "../plagiarism.errors";
import { scanJobId, scanRequestedEvent, PLAGIARISM_SCAN_JOB, PLAGIARISM_SCAN_QUEUE } from "../plagiarism.events";
import type { IFingerprintRepository } from "../repositories/fingerprint.repository";
import type { EligibleResourcesFilter, IResourceReadRepository } from "../repositories/resource-read.repository";
import type { CreateScanInput as RepoCreateScanInput, IScanRepository, ScanRow } from "../repositories/scan.repository";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import type { PlagiarismConfigService } from "./plagiarism-config.service";
import type { IScanEmitter } from "./scan-emitter";

export interface CreateScanInput {
  workspaceId: string;
  requestedBy: string;
  mode: PlagiarismScanMode;
  targetResourceIds: string[];
  excludeResourceIds: string[];
  excludeFolderIds: string[];
  note?: string;
}

export interface EligibleResourceDto {
  resourceId: string;
  name: string;
  extension: string | null;
  size: number;
  kind: "TEXT" | "CODE" | null;
  fingerprintStatus: string;
  truncated: boolean;
}

export interface ScanServiceDeps {
  scans: IScanRepository;
  fingerprints: IFingerprintRepository;
  resources: IResourceReadRepository;
  config: PlagiarismConfigService;
  tx: ITxRunner;
  outbox: IOutboxPort;
  emitter: IScanEmitter;
  now?: () => Date;
}

/** Tạo/liệt kê/huỷ/xoá lượt quét + hạn mức (be.md §5.2). */
export class ScanService {
  private readonly now: () => Date;

  constructor(private readonly d: ScanServiceDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async eligibleResources(filter: EligibleResourcesFilter): Promise<CursorResponse<EligibleResourceDto>> {
    const page = await this.d.resources.listEligible(filter);
    const fps = await this.d.fingerprints.findManyByResourceIds(page.data.map((r) => r.id));
    const byId = new Map(fps.map((f) => [f.resourceId, f]));
    return {
      data: page.data.map((r) => {
        const classification = classifyFileName(r.name);
        const fp = byId.get(r.id);
        return {
          resourceId: r.id,
          name: r.name,
          extension: r.extension,
          size: r.size,
          kind: classification.supported ? classification.kind : null,
          fingerprintStatus: !classification.supported ? "UNSUPPORTED" : (fp?.status ?? "PENDING"),
          truncated: fp?.truncated ?? false,
        };
      }),
      meta: page.meta,
    };
  }

  async create(input: CreateScanInput): Promise<ScanRow> {
    const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { status: true } });
    if (!workspace) throw new ScopeNotFoundError();
    if (workspace.status === "ARCHIVED") throw new ForbiddenError("Nhóm đã lưu trữ, chỉ đọc — không tạo được lượt quét mới");

    if (input.targetResourceIds.length === 0 || input.targetResourceIds.length > LIMITS.plagiarism.targetsMax) {
      throw plagiarismErrors.invalidTargetCount();
    }
    if (input.mode === "WITHIN_SELECTION" && input.targetResourceIds.length < 2) {
      throw plagiarismErrors.invalidTargetCount();
    }

    const active = await this.d.scans.countActive(input.workspaceId);
    if (active >= LIMITS.plagiarism.concurrentScansPerWorkspace) throw plagiarismErrors.tooManyConcurrentScans();

    const cfg = await this.d.config.current();
    const since = new Date(this.now());
    since.setUTCHours(0, 0, 0, 0);
    const createdToday = await this.d.scans.countCreatedSince(input.workspaceId, since);
    if (createdToday >= cfg.scansPerWorkspacePerDay) throw plagiarismErrors.dailyScanLimitReached();

    const allIds = [...new Set([...input.targetResourceIds, ...input.excludeResourceIds])];
    const found = await this.d.resources.findManyByIds(allIds);
    const byId = new Map(found.map((r) => [r.id, r]));
    for (const id of allIds) {
      const r = byId.get(id);
      if (!r || r.workspaceId !== input.workspaceId || r.deletedAt !== null) throw plagiarismErrors.resourceNotFound();
    }

    const fingerprints = await this.d.fingerprints.findManyByResourceIds(input.targetResourceIds);
    const fpById = new Map(fingerprints.map((f) => [f.resourceId, f]));
    const allUnsupported = input.targetResourceIds.every((id) => {
      const resource = byId.get(id);
      const classification = resource ? classifyFileName(resource.name) : { supported: false as const };
      return !classification.supported || fpById.get(id)?.status === "UNSUPPORTED";
    });
    if (allUnsupported) throw plagiarismErrors.unsupportedTargets(input.targetResourceIds);

    const configSnapshot = await this.d.config.snapshot();
    const expiresAt = new Date(this.now().getTime() + LIMITS.plagiarism.reportRetentionDays * 86_400_000);
    const repoInput: RepoCreateScanInput = {
      workspaceId: input.workspaceId,
      requestedBy: input.requestedBy,
      mode: input.mode,
      targetResourceIds: input.targetResourceIds,
      excludeResourceIds: input.excludeResourceIds,
      excludeFolderIds: input.excludeFolderIds,
      note: input.note ?? null,
      algoVersion: PLAGIARISM_ALGO_VERSION,
      configSnapshot,
      expiresAt,
    };

    const scan = await this.d.tx.run(async (tx) => {
      const created = await this.d.scans.create(tx, repoInput);
      await this.d.outbox.add(tx, scanRequestedEvent(created.id));
      return created;
    });
    this.d.emitter.scanUpdated(scan);
    return scan;
  }

  list(workspaceId: string, params: { cursor?: string; limit: number; status?: PlagiarismScanStatus }): Promise<CursorResponse<ScanRow>> {
    return this.d.scans.list({ workspaceId, ...params });
  }

  async getById(scanId: string): Promise<ScanRow> {
    const scan = await this.d.scans.findById(scanId);
    if (!scan || scan.deletedAt) throw new ScopeNotFoundError();
    return scan;
  }

  async cancel(scanId: string, actorId: string, isWorkspaceOwner: boolean): Promise<ScanRow> {
    const scan = await this.getById(scanId);
    if (!(scan.requestedBy === actorId || isWorkspaceOwner)) throw new ForbiddenError();
    const updated = await this.d.scans.updateIfStatus(scanId, ["QUEUED", "INDEXING", "SCANNING"], {
      status: "CANCELLED",
      cancelledAt: this.now(),
      cancelledBy: actorId,
    });
    if (!updated) throw plagiarismErrors.scanNotReady();
    this.d.emitter.scanUpdated(updated);
    return updated;
  }

  async remove(scanId: string, actorId: string, isWorkspaceOwner: boolean): Promise<void> {
    const scan = await this.getById(scanId);
    if (!(scan.requestedBy === actorId || isWorkspaceOwner)) throw new ForbiddenError();
    await this.d.scans.softDelete(scanId, this.now());
  }
}

export { scanJobId, PLAGIARISM_SCAN_JOB, PLAGIARISM_SCAN_QUEUE };
