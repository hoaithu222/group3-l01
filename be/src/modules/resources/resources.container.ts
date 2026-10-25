import { AuditService } from "../audit-log/audit-log.service";
import { PrismaFolderRepository } from "./repositories/folder.repository.prisma";
import { PrismaQuotaOverrideRepository } from "./repositories/quota-override.repository";
import { PrismaResourceRepository } from "./repositories/resource.repository.prisma";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import { PrismaUserDirectory } from "./repositories/user-directory";
import { PrismaWorkspaceStorageRepository } from "./repositories/workspace-storage.repository";
import { PublicAssetPort } from "./services/asset-port.public";
import { FolderService } from "./services/folder.service";
import { RedisResourceListCache } from "./services/resource-list.cache";
import { ResourceListService } from "./services/resource-list.service";
import { ResourceMutationService } from "./services/resource-mutation.service";
import { ResourcePurgeService } from "./services/resource-purge.service";
import { ResourceAdminService } from "./services/resource-admin.service";
import { ResourceCreationPortImpl } from "./services/resource-creation.port.impl";
import { ResourceService } from "./services/resource.service";
import { ResourceUploadGate } from "./services/resource-upload.gate";
import { RedisReservationStore, StorageQuotaService } from "./services/storage-quota.service";
import { StorageUsageService } from "./services/storage-usage.service";
import { TrashService } from "./services/trash.service";
import { PermissionWorkspaceAccess } from "./services/workspace-access";

export interface ResourcesContainer {
  folders: FolderService;
  resources: ResourceService;
  lists: ResourceListService;
  mutations: ResourceMutationService;
  trash: TrashService;
  admin: ResourceAdminService;
  purge: ResourcePurgeService;
  uploadGate: ResourceUploadGate;
  /** p7-04 `IResourceCreationPort` — export qua `./public.ts` cho `chat-extensions` (`to-resource`), không đi qua service nội bộ khác. */
  resourceCreation: ResourceCreationPortImpl;
}

let instance: ResourcesContainer | null = null;

/**
 * Nối DI cho module `resources` (Prisma + Redis thật) — MỘT lần cho cả API (`resources.routes.ts`,
 * `resources.admin.routes.ts`) lẫn worker (job `resources.purge`), vì tiến trình worker không import `router.ts`.
 */
export function getResourcesContainer(): ResourcesContainer {
  if (instance) return instance;

  const folderRepo = new PrismaFolderRepository();
  const resourceRepo = new PrismaResourceRepository();
  const workspaceStorage = new PrismaWorkspaceStorageRepository();
  const tx = new PrismaTxRunner();
  const outbox = new PrismaOutboxPort();
  const cache = new RedisResourceListCache();
  const access = new PermissionWorkspaceAccess();
  const quota = new StorageQuotaService(workspaceStorage, new RedisReservationStore());
  const users = new PrismaUserDirectory();
  const assets = new PublicAssetPort();
  const audit = new AuditService();

  const shared = { resources: resourceRepo, folders: folderRepo, tx, outbox, cache, access, quota, users, assets };
  const usage = new StorageUsageService(resourceRepo, folderRepo, quota);
  const purge = new ResourcePurgeService({ resources: resourceRepo, folders: folderRepo, tx, outbox, cache, assets, quota, audit });

  instance = {
    folders: new FolderService({ folders: folderRepo, resources: resourceRepo, tx, outbox, cache, access, quota }),
    resources: new ResourceService(shared),
    lists: new ResourceListService(shared),
    mutations: new ResourceMutationService(shared),
    trash: new TrashService({ folders: folderRepo, resources: resourceRepo, users, assets, access, quota, usage, purge }),
    admin: new ResourceAdminService(usage, quota, workspaceStorage, new PrismaQuotaOverrideRepository(), audit),
    purge,
    uploadGate: new ResourceUploadGate(access, quota),
    resourceCreation: new ResourceCreationPortImpl({ resources: resourceRepo, folders: folderRepo, tx, outbox, cache, access, quota, assets }),
  };
  return instance;
}
