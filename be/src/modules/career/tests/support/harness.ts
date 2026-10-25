import { newObjectId } from "../../../../core/utils/object-id";
import { toStoredCriteria, type SkillCriteriaInput } from "../../../../shared/criteria/skill-criteria";
import { createCareerContainer, type CareerContainer } from "../../career.container";
import type { SkillDefinition } from "../../entities/skill.interface";
import { InMemorySkillBadgeRepository, InMemoryCareerProfileRepository } from "../../repositories/skill-badge.repository.inmemory";
import { InMemorySkillDefinitionRepository } from "../../repositories/skill-definition.repository.inmemory";
import { InMemorySkillCreditRepository, InMemorySkillProgressRepository } from "../../repositories/skill-ledger.repository.inmemory";
import { FakeAudit, FakeConfig, FakeEmitter, FakeGate, FakeNotifier, FakeOutbox, FakeSource, FakeTx } from "./fakes";

/** Đồ thị `career` hoàn toàn in-memory (không Prisma/Redis) cho unit test service. */
export interface Harness {
  c: CareerContainer;
  defs: InMemorySkillDefinitionRepository;
  credits: InMemorySkillCreditRepository;
  progress: InMemorySkillProgressRepository;
  badges: InMemorySkillBadgeRepository;
  careers: InMemoryCareerProfileRepository;
  source: FakeSource;
  outbox: FakeOutbox;
  notifier: FakeNotifier;
  config: FakeConfig;
  audit: FakeAudit;
  emitter: FakeEmitter;
  gate: FakeGate;
}

export function buildHarness(): Harness {
  const defs = new InMemorySkillDefinitionRepository();
  const credits = new InMemorySkillCreditRepository();
  const badges = new InMemorySkillBadgeRepository();
  const progress = new InMemorySkillProgressRepository(badges);
  const careers = new InMemoryCareerProfileRepository();
  const source = new FakeSource();
  const outbox = new FakeOutbox();
  const notifier = new FakeNotifier();
  const config = new FakeConfig();
  const audit = new FakeAudit();
  const emitter = new FakeEmitter();
  const gate = new FakeGate();
  const c = createCareerContainer({ definitions: defs, credits, progress, badges, careers, source, tx: new FakeTx(), outbox, notifier, config, audit, emitter, gate });
  return { c, defs, credits, progress, badges, careers, source, outbox, notifier, config, audit, emitter, gate };
}

export async function addSkill(
  h: Harness,
  over: { code?: string; labels?: string[]; criteria?: Partial<SkillCriteriaInput>; isActive?: boolean } = {}
): Promise<SkillDefinition> {
  const criteria: SkillCriteriaInput = { requiredTasksDone: 3, minStoryPoints: null, minAvgPeerScore: null, requireReview: false, ...over.criteria };
  return h.defs.create({
    code: over.code ?? "reactjs",
    name: over.code === undefined ? "ReactJS" : over.code,
    description: null,
    category: "FRONTEND",
    labelMatch: over.labels ?? ["reactjs"],
    criteria: toStoredCriteria(criteria),
    icon: "keyboard",
    order: 0,
    isActive: over.isActive ?? true,
    createdBy: null,
  });
}

export const WS = newObjectId();
export const BOARD = newObjectId();

/** Payload `task.completed` đúng hình dạng producer p3-02 (`completedEvent`). Mặc định thẻ ở DONE lần `n`. */
export function completed(h: Harness, over: { taskId?: string; n?: number; assignees: string[]; sp?: number | null; labels?: string[]; review?: Record<string, unknown> }) {
  const taskId = over.taskId ?? newObjectId();
  const n = over.n ?? 1;
  h.source.taskStates.set(taskId, { columnKind: "DONE", completionCount: n, deletedAt: null });
  return {
    event: "task.completed",
    taskId,
    boardId: BOARD,
    workspaceId: WS,
    actorId: over.assignees[0] ?? null,
    assigneeIds: over.assignees,
    storyPoints: over.sp === undefined ? 5 : over.sp,
    dueDate: null,
    completedAt: new Date().toISOString(),
    onTime: false,
    completionCount: n,
    taskCreatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    labelNames: over.labels ?? ["ReactJS"],
    review: over.review ?? { enabled: false, approved: false },
  };
}

export function reopened(h: Harness, taskId: string, n: number, assignees: string[]) {
  h.source.taskStates.set(taskId, { columnKind: "IN_PROGRESS", completionCount: n, deletedAt: null });
  return { event: "task.reopened", taskId, boardId: BOARD, workspaceId: WS, actorId: null, assigneeIds: assignees, completionCount: n, reopenedAt: new Date().toISOString() };
}
