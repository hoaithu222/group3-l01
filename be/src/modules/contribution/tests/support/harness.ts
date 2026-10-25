/* eslint-disable @typescript-eslint/require-await -- bản giả (test) cài đặt interface bất đồng bộ */
import { ScopeForbiddenError, ScopeNotFoundError } from "../../../../core/exceptions";
import type { AuthUser } from "../../../../core/types/express";
import type { BoardRef, DirectoryUser } from "../../entities/contribution.interface";
import type { ActivityScope, IActivitySourceRepository, SourceCount } from "../../repositories/activity-source.repository.interface";
import { InMemoryActivityDailyRepository } from "../../repositories/activity-daily.repository.inmemory";
import { InMemoryContributionExportRepository } from "../../repositories/contribution-export.repository.inmemory";
import { InMemoryContributionFactRepository } from "../../repositories/contribution-fact.repository.inmemory";
import { InMemoryContributionSnapshotRepository } from "../../repositories/contribution-snapshot.repository.inmemory";
import { InMemoryContributionStateRepository } from "../../repositories/contribution-state.repository.inmemory";
import type { IContribNotifier, IContribOutbox, ITxRunner, TxHandle } from "../../repositories/tx";
import { ActivityRefreshService } from "../../services/activity-refresh.service";
import type { ContributionAccess } from "../../services/contribution-access";
import { ContributionComputer } from "../../services/contribution-computer";
import { ContributionConfigService } from "../../services/contribution-config.service";
import { ContributionContextLoader } from "../../services/contribution-context";
import { ContributionFactsService } from "../../services/contribution-facts.service";
import { ContributionReconcileService } from "../../services/contribution-reconcile.service";
import { ContributionMemberTasksService } from "../../services/contribution-member-tasks.service";
import { ContributionService } from "../../services/contribution.service";
import { ContributionTimezoneSync } from "../../services/contribution-timezone.service";
import { ExportDataBuilder } from "../../services/export/contribution-export-data";
import { ContributionExportJobService } from "../../services/export/contribution-export-job.service";
import { DefaultContribPdf, type IContribAssets } from "../../services/export/contribution-export.ports";
import { ContributionExportService } from "../../services/export/contribution-export.service";
import { HeatmapService } from "../../services/heatmap.service";
import { FakeAudit, FakeCache, FakeConfig, FakeDirectory, FakeEmitter, FakeQueue, FakeSource, oid, user } from "./fakes";

export class FakeActivitySource implements IActivitySourceRepository {
  task: SourceCount[] = [];
  comments: SourceCount[] = [];
  reviews: SourceCount[] = [];
  calls = 0;
  async countTaskActivity(_s: ActivityScope): Promise<SourceCount[]> {
    this.calls += 1;
    return this.task;
  }
  async countComments(): Promise<SourceCount[]> {
    return this.comments;
  }
  async countReviews(): Promise<SourceCount[]> {
    return this.reviews;
  }
}

/** Quyền giả: `editors` sửa được, `readers` xem được, còn lại `404` (như khách/người ngoài). */
export class FakeAccess {
  readers = new Set<string>();
  editors = new Set<string>();
  constructor(private readonly directory: FakeDirectory) {}

  async readBoard(u: AuthUser, boardId: string): Promise<BoardRef> {
    if (!this.readers.has(u.id) && !this.editors.has(u.id)) throw new ScopeNotFoundError();
    return this.board(boardId);
  }
  async editBoard(u: AuthUser, boardId: string): Promise<BoardRef> {
    if (this.editors.has(u.id)) return this.board(boardId);
    if (this.readers.has(u.id)) throw new ScopeForbiddenError("Không đủ quyền", "PERM_001");
    throw new ScopeNotFoundError();
  }
  async readWorkspace(u: AuthUser): Promise<void> {
    if (!this.readers.has(u.id) && !this.editors.has(u.id)) throw new ScopeNotFoundError();
  }
  async canReadBoard(u: AuthUser): Promise<boolean> {
    return this.readers.has(u.id) || this.editors.has(u.id);
  }
  private async board(boardId: string): Promise<BoardRef> {
    const b = await this.directory.getBoard(boardId);
    if (!b) throw new ScopeNotFoundError();
    return b;
  }
}

export class FakeAssets implements IContribAssets {
  created: Array<{ id: string; ownerId: string; workspaceId: string; fileName: string; buffer: Buffer }> = [];
  links: Array<{ assetId: string; exportId: string }> = [];
  detached: string[] = [];
  private seq = 0x100;
  async createPdf(input: { ownerId: string; workspaceId: string; fileName: string; buffer: Buffer }): Promise<{ id: string }> {
    const id = oid(this.seq++);
    this.created.push({ id, ...input });
    return { id };
  }
  async attach(_tx: TxHandle, input: { assetId: string; exportId: string }): Promise<void> {
    this.links.push({ assetId: input.assetId, exportId: input.exportId });
  }
  async detachAll(_tx: TxHandle, exportId: string): Promise<void> {
    this.detached.push(exportId);
  }
  async signedUrl(assetId: string): Promise<{ url: string; expiresAt: string }> {
    return { url: `https://files.test/${assetId}?sig=x`, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }
}

export class FakeNotifier implements IContribNotifier {
  sent: Array<{ type: string; dedupeKey: string; recipients: string[]; refs?: Record<string, unknown> }> = [];
  async notify(_tx: TxHandle, input: { type: string; dedupeKey: string; recipients: Array<{ userId: string }>; refs?: Record<string, unknown> }): Promise<void> {
    this.sent.push({ type: input.type, dedupeKey: input.dedupeKey, recipients: input.recipients.map((r) => r.userId), refs: input.refs });
  }
  async exists(_tx: TxHandle, dedupeKey: string): Promise<boolean> {
    return this.sent.some((s) => s.dedupeKey === dedupeKey);
  }
}

export class FakeOutbox implements IContribOutbox {
  events: Array<{ jobName: string; queue: string; dedupeKey: string; payload: Record<string, unknown> }> = [];
  async add(_tx: TxHandle, event: { jobName: string; queue: string; dedupeKey: string; payload: Record<string, unknown> }): Promise<void> {
    this.events.push(event);
  }
}

const fakeTx: ITxRunner = { run: (fn) => fn({} as TxHandle) };

export const IDS = {
  ws: oid(0xa1),
  board: oid(0xb1),
  owner: oid(0xc1),
  an: oid(0xc2),
  binh: oid(0xc3),
  chi: oid(0xc4),
  outsider: oid(0xc9),
};

/** Đồ thị dịch vụ chạy hoàn toàn bằng bản in-memory/giả — thay cho DB/Redis/queue thật. */
export function createHarness(start = new Date("2026-09-15T03:00:00Z")) {
  const clock = { now: start };
  const now = (): Date => clock.now;
  const directory = new FakeDirectory();
  const facts = new InMemoryContributionFactRepository();
  const states = new InMemoryContributionStateRepository();
  const snapshots = new InMemoryContributionSnapshotRepository();
  const daily = new InMemoryActivityDailyRepository();
  const exportRepo = new InMemoryContributionExportRepository();
  const source = new FakeSource();
  const activitySource = new FakeActivitySource();
  const config = new FakeConfig();
  const queue = new FakeQueue();
  const audit = new FakeAudit();
  const emitter = new FakeEmitter();
  const cache = new FakeCache();
  const assets = new FakeAssets();
  const notifier = new FakeNotifier();
  const outbox = new FakeOutbox();
  const access = new FakeAccess(directory);
  const asAccess = access as unknown as ContributionAccess;

  directory.workspaces.set(IDS.ws, "Nhóm Đồ án");
  directory.boards.set(IDS.board, { id: IDS.board, workspaceId: IDS.ws, name: "Sprint 1", archivedAt: null, createdAt: new Date("2026-08-01T00:00:00Z"), version: 3, contribution: null });
  directory.members.set(IDS.ws, [IDS.owner, IDS.an, IDS.binh, IDS.chi]);
  const names: Record<string, string> = { [IDS.owner]: "Minh", [IDS.an]: "An", [IDS.binh]: "Bình", [IDS.chi]: "Chi" };
  for (const [id, name] of Object.entries(names)) directory.users.set(id, { id, name, avatarUrl: null, membership: "ACTIVE" } satisfies DirectoryUser);
  for (const id of Object.keys(names)) directory.known.add(id);
  access.editors.add(IDS.owner);
  for (const id of [IDS.an, IDS.binh, IDS.chi]) access.readers.add(id);

  const context = new ContributionContextLoader(states, config);
  const computer = new ContributionComputer(facts, directory);
  const reports = new ContributionService({ access: asAccess, context, computer, snapshots, states, directory, cache, queue, now });
  const memberTasks = new ContributionMemberTasksService({ access: asAccess, context, facts, directory });
  const refresh = new ActivityRefreshService({ daily, activitySource, boardSource: source, states, directory, config, now });
  const factsService = new ContributionFactsService({ facts, states, source, config, queue, now });
  const builder = new ExportDataBuilder({ reports, directory, daily, refresh, now });

  return {
    clock,
    IDS,
    directory,
    facts,
    states,
    snapshots,
    daily,
    exportRepo,
    source,
    activitySource,
    config,
    queue,
    audit,
    emitter,
    cache,
    assets,
    notifier,
    outbox,
    access,
    context,
    reports,
    memberTasks,
    refresh,
    factsService,
    builder,
    configService: new ContributionConfigService({ access: asAccess, context, states, directory, writer: directory, tx: fakeTx, audit, queue, emitter, now }),
    heatmap: new HeatmapService({ access: asAccess, context, refresh, daily, states, directory, config }),
    reconcile: new ContributionReconcileService({ facts, source, factsService, now }),
    timezoneSync: new ContributionTimezoneSync({ states, config, factsService, now }),
    exports: new ContributionExportService({ access: asAccess, context, builder, exports: exportRepo, assets, tx: fakeTx, outbox, now }),
    exportJobs: new ContributionExportJobService({ exports: exportRepo, directory, context, builder, pdf: new DefaultContribPdf(), assets, notifier, tx: fakeTx, now }),
    as: user,
  };
}

export type Harness = ReturnType<typeof createHarness>;

/** Ghi nhanh một thẻ hoàn thành vào fact (bỏ qua sự kiện). */
export async function seedDone(
  h: Harness,
  n: number,
  over: { assignees?: string[]; storyPoints?: number | null; due?: string | null; completedAt?: string } = {}
): Promise<string> {
  const taskId = oid(0x500 + n);
  await h.facts.applyCompleted({
    taskId,
    boardId: IDS.board,
    workspaceId: IDS.ws,
    assigneeIds: over.assignees ?? [IDS.an],
    storyPoints: over.storyPoints === undefined ? 3 : over.storyPoints,
    dueDate: over.due === undefined ? null : over.due === null ? null : new Date(over.due),
    completedAt: new Date(over.completedAt ?? "2026-09-10T05:00:00Z"),
    completionCount: 1,
    reviewApproved: null,
  });
  h.directory.tasks.set(taskId, { id: taskId, title: `Thẻ ${n}`, deleted: false });
  return taskId;
}
