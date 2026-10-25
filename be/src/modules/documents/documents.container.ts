import { AuditService } from "../audit-log/audit-log.service";
import { PrismaCollaboratorRepository } from "./repositories/collaborator.repository.prisma";
import { PrismaDocumentDirectory } from "./repositories/document-directory.prisma";
import { PrismaDocumentRepository } from "./repositories/document.repository.prisma";
import { PrismaSnapshotRepository } from "./repositories/snapshot.repository.prisma";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import { DocumentAccessRevokedService } from "./services/document-revoke.service";
import { DocumentAssetsService } from "./services/document-assets.service";
import { DocumentCollabService } from "./services/document-collab.service";
import { DocumentCollaboratorsService } from "./services/document-collaborators.service";
import { DocumentEventsPublisher } from "./services/document-events-publisher";
import { PrismaDocumentAssetPort, PrismaDocumentNotifier } from "./services/document-integrations";
import { DocumentPlaintextService } from "./services/document-plaintext.service";
import { DocumentSnapshotCronService } from "./services/document-snapshot-cron.service";
import { DocumentSnapshotsService } from "./services/document-snapshots.service";
import { DocumentsService } from "./services/documents.service";

/**
 * Nối dây DI cho module tài liệu — dùng CHUNG bởi `documents.routes.ts`, `internal-documents.routes.ts`, `collab-admin.routes.ts` và các job (tiến trình worker riêng
 * không import routes nên dùng `getDocumentsContainer()`). Không có DI container trong codebase.
 */
export function createDocumentsContainer() {
  const documents = new PrismaDocumentRepository();
  const collaborators = new PrismaCollaboratorRepository();
  const snapshots = new PrismaSnapshotRepository();
  const directory = new PrismaDocumentDirectory();
  const tx = new PrismaTxRunner();
  const outbox = new PrismaOutboxPort();
  const audit = new AuditService();

  return {
    documents,
    collaborators,
    snapshots,
    directory,
    audit,
    service: new DocumentsService({ documents, collaborators, directory, tx, outbox, audit }),
    collaboratorsService: new DocumentCollaboratorsService({ documents, collaborators, directory, tx, outbox, notifier: new PrismaDocumentNotifier(), audit }),
    snapshotsService: new DocumentSnapshotsService({ documents, snapshots, directory, tx, outbox, audit }),
    collabService: new DocumentCollabService({ documents, directory, tx, outbox }),
    assetsService: new DocumentAssetsService(documents, new PrismaDocumentAssetPort(), tx),
    plaintext: new DocumentPlaintextService(documents),
    cron: new DocumentSnapshotCronService(documents, snapshots),
    revoked: new DocumentAccessRevokedService(),
    events: new DocumentEventsPublisher(documents, collaborators, directory),
  };
}

export type DocumentsContainer = ReturnType<typeof createDocumentsContainer>;

let cached: DocumentsContainer | null = null;

/** Singleton lười cho job/route (tránh dựng lại repo/service mỗi lần). */
export function getDocumentsContainer(): DocumentsContainer {
  cached ??= createDocumentsContainer();
  return cached;
}
