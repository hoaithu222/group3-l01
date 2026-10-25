/* eslint-disable @typescript-eslint/require-await -- bản giả (test) cài đặt interface bất đồng bộ */
import { DEFAULT_CONTRIBUTION_CONFIG, type ContributionConfigValue } from "../../../../core/constants/contribution";
import type { AuthUser } from "../../../../core/types/express";
import type { BoardRef, DirectoryUser, TaskRef } from "../../entities/contribution.interface";
import type { IBoardContributionWriter, IContributionDirectory } from "../../repositories/contribution-directory.repository.interface";
import type { IContributionSourceRepository, SourceDoneTask, SourceSubmittedReview } from "../../repositories/contribution-source.repository.interface";
import type { IContribAudit, IContribCache, IContribConfigPort, IContribEmitter, IContribQueue, AuditInput } from "../../services/contribution.ports";
import { cloneConfig } from "../../services/contribution-config.schema";

export class FakeConfig implements IContribConfigPort {
  value: ContributionConfigValue = cloneConfig(DEFAULT_CONTRIBUTION_CONFIG);
  tz = "Asia/Ho_Chi_Minh";
  /** Múi giờ riêng của từng nhóm (mặc định mọi nhóm dùng `tz`, như `pm.timezone` toàn hệ thống hiện nay). */
  tzByWorkspace = new Map<string, string>();
  async defaults(): Promise<ContributionConfigValue> {
    return cloneConfig(this.value);
  }
  async timezone(workspaceId?: string): Promise<string> {
    return (workspaceId ? this.tzByWorkspace.get(workspaceId) : undefined) ?? this.tz;
  }
}

export class FakeQueue implements IContribQueue {
  jobs: Array<{ boardId: string; jobId: string; delayMs: number }> = [];
  async enqueueRecompute(boardId: string, jobId: string, delayMs: number): Promise<void> {
    this.jobs.push({ boardId, jobId, delayMs });
  }
}

export class FakeAudit implements IContribAudit {
  records: AuditInput[] = [];
  async record(input: AuditInput): Promise<void> {
    this.records.push(input);
  }
}

export class FakeEmitter implements IContribEmitter {
  events: Array<{ boardId: string; version: number }> = [];
  contributionChanged(boardId: string, version: number): void {
    this.events.push({ boardId, version });
  }
}

export class FakeCache implements IContribCache {
  store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }
  async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

export class FakeSource implements IContributionSourceRepository {
  reviews: SourceSubmittedReview[] = [];
  doneTasks = new Map<string, SourceDoneTask[]>();
  states = new Map<string, { columnKind: string }>();
  assignees = new Map<string, string[]>();
  boards: Array<{ id: string; workspaceId: string }> = [];

  async listBoardsTouchedSince(): Promise<Array<{ id: string; workspaceId: string }>> {
    return this.boards;
  }
  async listDoneTasks(boardId: string): Promise<SourceDoneTask[]> {
    return this.doneTasks.get(boardId) ?? [];
  }
  async listSubmittedReviewsSince(): Promise<SourceSubmittedReview[]> {
    return this.reviews;
  }
  async findSubmittedReview(reviewId: string): Promise<SourceSubmittedReview | null> {
    return this.reviews.find((r) => r.id === reviewId) ?? null;
  }
  async taskStates(taskIds: readonly string[]): Promise<Map<string, { columnKind: string }>> {
    return new Map(taskIds.flatMap((id) => (this.states.has(id) ? [[id, this.states.get(id) as { columnKind: string }] as const] : [])));
  }
  async currentAssignees(taskIds: readonly string[]): Promise<Map<string, string[]>> {
    return new Map(taskIds.flatMap((id) => (this.assignees.has(id) ? [[id, this.assignees.get(id) as string[]] as const] : [])));
  }
}

export class FakeDirectory implements IContributionDirectory, IBoardContributionWriter {
  boards = new Map<string, BoardRef>();
  members = new Map<string, string[]>();
  users = new Map<string, DirectoryUser>();
  tasks = new Map<string, TaskRef>();
  known = new Set<string>();
  workspaces = new Map<string, string>();
  written: Array<{ boardId: string; config: ContributionConfigValue }> = [];

  async getBoard(boardId: string): Promise<BoardRef | null> {
    return this.boards.get(boardId) ?? null;
  }
  async getWorkspaceName(workspaceId: string): Promise<string | null> {
    return this.workspaces.get(workspaceId) ?? null;
  }
  /** `Workspace.timezone` thô theo nhóm (test đặt `timezones.set(wsId, "Asia/Tokyo")`); vắng ⇒ `null` = theo mặc định hệ thống. */
  timezones = new Map<string, string>();
  async getWorkspaceTimezone(workspaceId: string): Promise<string | null> {
    return this.timezones.get(workspaceId) ?? null;
  }
  async listMemberIds(workspaceId: string): Promise<string[]> {
    return this.members.get(workspaceId) ?? [];
  }
  async getUsers(_workspaceId: string, userIds: readonly string[]): Promise<Map<string, DirectoryUser>> {
    return new Map(userIds.flatMap((id) => (this.users.has(id) ? [[id, this.users.get(id) as DirectoryUser] as const] : [])));
  }
  async isKnownMember(_workspaceId: string, userId: string): Promise<boolean> {
    return this.known.has(userId);
  }
  async getTasks(taskIds: readonly string[]): Promise<Map<string, TaskRef>> {
    return new Map(taskIds.flatMap((id) => (this.tasks.has(id) ? [[id, this.tasks.get(id) as TaskRef] as const] : [])));
  }
  async listBoards(workspaceId: string): Promise<BoardRef[]> {
    return [...this.boards.values()].filter((b) => b.workspaceId === workspaceId);
  }
  async workspaceExists(workspaceId: string): Promise<boolean> {
    return this.workspaces.has(workspaceId);
  }
  async setContribution(boardId: string, config: ContributionConfigValue): Promise<void> {
    this.written.push({ boardId, config });
    const board = this.boards.get(boardId);
    if (board) board.contribution = config;
  }
}

export const user = (id: string, role = "user"): AuthUser => ({ id, email: `${id}@e.com`, name: id, role });

export const oid = (n: number): string => n.toString(16).padStart(24, "0");
