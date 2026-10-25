/* eslint-disable @typescript-eslint/require-await -- bản giả (test) cài đặt interface bất đồng bộ */
import type { OutboxEventInput } from "../../../../infrastructure/queue";
import type { NotifyInput } from "../../../notifications/public";
import type { ISkillSourceRepository, LabelSuggestion, TaskStateRef, TaskTitleRef, UserRef } from "../../repositories/skill-source.repository";
import type { ICareerNotifier, ICareerOutbox, ITxRunner, TxHandle } from "../../repositories/tx";
import type { AuditInput, ICareerAudit, IReevaluateGate, ISkillConfigPort, ISkillEmitter, SkillUnlockedSocketPayload } from "../../services/career.ports";

/** Transaction giả: chạy thẳng callback (repo in-memory bỏ qua `tx`). */
export class FakeTx implements ITxRunner {
  async run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return fn({} as TxHandle);
  }
}

export class FakeOutbox implements ICareerOutbox {
  rows: OutboxEventInput[] = [];
  async add(_tx: TxHandle, event: OutboxEventInput): Promise<void> {
    this.rows.push(event);
  }
}

export class FakeNotifier implements ICareerNotifier {
  sent: NotifyInput[] = [];
  async notify(_tx: TxHandle, input: NotifyInput): Promise<void> {
    this.sent.push(input);
  }
}

export class FakeConfig implements ISkillConfigPort {
  minSp = 1;
  reconcile = true;
  async creditMinStoryPoints(): Promise<number> {
    return this.minSp;
  }
  async nightlyReconcile(): Promise<boolean> {
    return this.reconcile;
  }
}

export class FakeAudit implements ICareerAudit {
  records: AuditInput[] = [];
  async record(input: AuditInput): Promise<void> {
    this.records.push(input);
  }
}

export class FakeEmitter implements ISkillEmitter {
  events: Array<{ userId: string; payload: SkillUnlockedSocketPayload }> = [];
  unlocked(userId: string, payload: SkillUnlockedSocketPayload): void {
    this.events.push({ userId, payload });
  }
}

export class FakeGate implements IReevaluateGate {
  open = true;
  async tryAcquire(): Promise<boolean> {
    const was = this.open;
    this.open = false;
    return was;
  }
}

/** Nguồn dữ liệu (thẻ/lượt chấm/nhóm/thành viên) giả — set thẳng Map trong test. */
export class FakeSource implements ISkillSourceRepository {
  taskStates = new Map<string, TaskStateRef>();
  roundAvg = new Map<string, number>();
  taskRefs = new Map<string, TaskTitleRef>();
  wsNames = new Map<string, string>();
  /** userId → các nhóm ACTIVE (không GUEST). */
  memberships = new Map<string, string[]>();
  userRefs = new Map<string, UserRef>();

  async taskState(taskId: string): Promise<TaskStateRef | null> {
    return this.taskStates.get(taskId) ?? null;
  }
  async roundReviewAvgX10(roundId: string): Promise<number | null> {
    return this.roundAvg.get(roundId) ?? null;
  }
  async tasks(ids: readonly string[]): Promise<Map<string, TaskTitleRef>> {
    return new Map([...this.taskRefs].filter(([id]) => ids.includes(id)));
  }
  async workspaceNames(ids: readonly string[]): Promise<Map<string, string>> {
    return new Map([...this.wsNames].filter(([id]) => ids.includes(id)));
  }
  async memberWorkspaceIds(userId: string, among?: readonly string[]): Promise<Set<string>> {
    return new Set((this.memberships.get(userId) ?? []).filter((w) => !among || among.includes(w)));
  }
  async users(ids: readonly string[]): Promise<Map<string, UserRef>> {
    return new Map(ids.map((id) => [id, this.userRefs.get(id) ?? { id, name: `U${id.slice(-3)}`, status: "ACTIVE" }]));
  }
  async labelSuggestions(): Promise<LabelSuggestion[]> {
    return [];
  }
}
