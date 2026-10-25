import { Prisma } from "@prisma/client";
import type { ForceEndCall, ForceEndMeeting, IMediaOpsForceEndRepository } from "./media-ops-force-end.repository.interface";
import type { TxHandle } from "./tx";

export class PrismaMediaOpsForceEndRepository implements IMediaOpsForceEndRepository {
  loadMeeting(id: string, tx: TxHandle): Promise<ForceEndMeeting | null> {
    return tx.meeting.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true, workspaceId: true, status: true, version: true, currentCallId: true } });
  }

  loadCall(id: string, tx: TxHandle): Promise<ForceEndCall | null> {
    return tx.call.findUnique({ where: { id }, select: { id: true, scopeType: true, scopeId: true, mode: true, status: true, workspaceId: true, peakParticipants: true, version: true } });
  }

  connectedCount(callId: string, tx: TxHandle): Promise<number> {
    return tx.callParticipant.count({ where: { callId, state: { in: ["CONNECTED", "RECONNECTING"] } } });
  }

  async outboxExists(dedupeKey: string, tx: TxHandle): Promise<boolean> {
    return (await tx.outboxEvent.count({ where: { dedupeKey } })) > 0;
  }

  isDuplicateError(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
  }
}
