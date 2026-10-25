import { AuditService } from "../audit-log/audit-log.service";
import { PrismaCollaboratorRepository } from "./repositories/collaborator.repository.prisma";
import { PrismaSnapshotRepository } from "./repositories/snapshot.repository.prisma";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import { PrismaWhiteboardDirectory } from "./repositories/whiteboard-directory.prisma";
import { PrismaWhiteboardRepository } from "./repositories/whiteboard.repository.prisma";
import { PrismaWhiteboardAssetPort } from "./services/whiteboard-integrations";
import { WhiteboardAccessRevokedService } from "./services/whiteboard-revoke.service";
import { WhiteboardCollabService } from "./services/whiteboard-collab.service";
import { WhiteboardCollaboratorsService } from "./services/whiteboard-collaborators.service";
import { WhiteboardEventsPublisher } from "./services/whiteboard-events-publisher";
import { WhiteboardSnapshotCronService } from "./services/whiteboard-snapshot-cron.service";
import { WhiteboardSnapshotsService } from "./services/whiteboard-snapshots.service";
import { WhiteboardsService } from "./services/whiteboards.service";

/**
 * Nối dây DI cho module bảng trắng — dùng CHUNG bởi `whiteboards.routes.ts`, `internal-whiteboards.routes.ts` và các job (tiến trình worker riêng không import routes nên dùng
 * `getWhiteboardsContainer()`). Không có DI container trong codebase.
 */
export function createWhiteboardsContainer() {
  const whiteboards = new PrismaWhiteboardRepository();
  const collaborators = new PrismaCollaboratorRepository();
  const snapshots = new PrismaSnapshotRepository();
  const directory = new PrismaWhiteboardDirectory();
  const tx = new PrismaTxRunner();
  const outbox = new PrismaOutboxPort();
  const audit = new AuditService();

  return {
    whiteboards,
    collaborators,
    snapshots,
    directory,
    audit,
    service: new WhiteboardsService({ whiteboards, collaborators, directory, assets: new PrismaWhiteboardAssetPort(), tx, outbox, audit }),
    collaboratorsService: new WhiteboardCollaboratorsService({ whiteboards, collaborators, directory, tx, outbox, audit }),
    snapshotsService: new WhiteboardSnapshotsService({ whiteboards, snapshots, directory, tx, outbox, audit }),
    collabService: new WhiteboardCollabService({ whiteboards, directory, tx }),
    cron: new WhiteboardSnapshotCronService(whiteboards, snapshots),
    revoked: new WhiteboardAccessRevokedService(),
    events: new WhiteboardEventsPublisher(whiteboards, collaborators, directory),
  };
}

export type WhiteboardsContainer = ReturnType<typeof createWhiteboardsContainer>;

let cached: WhiteboardsContainer | null = null;

/** Singleton lười cho job/route (tránh dựng lại repo/service mỗi lần). */
export function getWhiteboardsContainer(): WhiteboardsContainer {
  cached ??= createWhiteboardsContainer();
  return cached;
}
