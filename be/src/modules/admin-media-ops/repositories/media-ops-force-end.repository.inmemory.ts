import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { ForceEndCall, ForceEndMeeting, IMediaOpsForceEndRepository } from "./media-ops-force-end.repository.interface";
import type { IOutboxPort, ITxRunner, TxHandle } from "./tx";

/** Bản in-memory cho test đơn vị (transaction giả không rollback; outbox giả kiểm unique `dedupeKey` như Mongo). */
export class InMemoryForceEndRepository implements IMediaOpsForceEndRepository {
  meetings = new Map<string, ForceEndMeeting>();
  calls = new Map<string, ForceEndCall>();
  connected = new Map<string, number>();
  /** `dedupeKey` đã có trong outbox — dùng chung với `InMemoryOutbox`. */
  keys = new Set<string>();

  loadMeeting(id: string): Promise<ForceEndMeeting | null> {
    return Promise.resolve(this.meetings.get(id) ?? null);
  }

  loadCall(id: string): Promise<ForceEndCall | null> {
    return Promise.resolve(this.calls.get(id) ?? null);
  }

  connectedCount(callId: string): Promise<number> {
    return Promise.resolve(this.connected.get(callId) ?? 0);
  }

  outboxExists(dedupeKey: string): Promise<boolean> {
    return Promise.resolve(this.keys.has(dedupeKey));
  }

  isDuplicateError(err: unknown): boolean {
    return err instanceof Error && err.message === "P2002";
  }
}

export class InMemoryTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return fn({} as TxHandle);
  }
}

export class InMemoryOutbox implements IOutboxPort {
  events: OutboxEventInput[] = [];
  constructor(private readonly keys: Set<string>) {}

  add(_tx: TxHandle, event: OutboxEventInput): Promise<void> {
    if (this.keys.has(event.dedupeKey)) return Promise.reject(new Error("P2002"));
    this.keys.add(event.dedupeKey);
    this.events.push(event);
    return Promise.resolve();
  }
}
