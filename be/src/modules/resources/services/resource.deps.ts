import type { IFolderRepository } from "../repositories/folder.repository.interface";
import type { IResourceRepository } from "../repositories/resource.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import type { IUserDirectory } from "../repositories/user-directory";
import type { IAssetPort } from "./asset-port";
import type { IResourceListCache } from "./resource-list.cache";
import type { StorageQuotaService } from "./storage-quota.service";
import type { IWorkspaceAccess } from "./workspace-access";

/** Phụ thuộc chung của các service tệp (`ResourceService`, `ResourceListService`, `ResourceMutationService`). */
export interface ResourceDeps {
  resources: IResourceRepository;
  folders: IFolderRepository;
  tx: ITxRunner;
  outbox: IOutboxPort;
  cache: IResourceListCache;
  access: IWorkspaceAccess;
  quota: StorageQuotaService;
  users: IUserDirectory;
  assets: IAssetPort;
  /** Đồng hồ — test "giả lập đồng hồ" (thùng rác quá hạn) truyền hàm riêng. */
  now?: () => Date;
}

export type ResolvedDeps = ResourceDeps & { now: () => Date };

export function withClock(deps: ResourceDeps): ResolvedDeps {
  return { ...deps, now: deps.now ?? (() => new Date()) };
}

export const DAY_MS = 24 * 3600 * 1000;
