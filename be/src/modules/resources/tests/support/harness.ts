import { GUEST_HIDDEN_ACTIONS, type Action, type ResolvedAccess } from "../../../../core/permission";
import { ScopeForbiddenError, ScopeNotFoundError } from "../../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";
import type { AuthUser } from "../../../../core/types/express";
import { computeWorkspaceActions } from "../../../workspaces/services/workspace-permission.resolver";
import { InMemoryFolderRepository } from "../../repositories/folder.repository.inmemory";
import { InMemoryResourceRepository } from "../../repositories/resource.repository.inmemory";
import { InMemoryOutboxPort, InMemoryTxRunner } from "../../repositories/tx";
import { InMemoryUserDirectory } from "../../repositories/user-directory";
import { InMemoryWorkspaceStorageRepository } from "../../repositories/workspace-storage.repository";
import { InMemoryAssetPort, type AttachableAsset } from "../../services/asset-port";
import { FolderService } from "../../services/folder.service";
import { InMemoryResourceListCache } from "../../services/resource-list.cache";
import { ResourceListService } from "../../services/resource-list.service";
import { ResourceMutationService } from "../../services/resource-mutation.service";
import { ResourcePurgeService } from "../../services/resource-purge.service";
import { ResourceService } from "../../services/resource.service";
import { InMemoryReservationStore, StorageQuotaService, type ResourceConfigReader } from "../../services/storage-quota.service";
import { StorageUsageService } from "../../services/storage-usage.service";
import { TrashService } from "../../services/trash.service";
import type { IWorkspaceAccess } from "../../services/workspace-access";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export const WS = "aaaaaaaaaaaaaaaaaaaaaaaa";
export const user = (id: string): AuthUser => ({ id, email: `${id}@e.com` });
export const OWNER = user("0000000000000000000000a1");
export const ADMIN = user("0000000000000000000000a2");
export const MEMBER = user("0000000000000000000000a3");
export const OTHER = user("0000000000000000000000a4");
export const GUEST = user("0000000000000000000000a5");
export const OUTSIDER = user("0000000000000000000000a6");

/** Kiểm quyền giả dùng ĐÚNG ma trận vai → action thật (D-28) + luật GUEST → 404 của `permissionService.assert`. */
export class FakeAccess implements IWorkspaceAccess {
  readonly roles = new Map<string, Role>();
  archived = false;

  constructor() {
    for (const [u, role] of [[OWNER, "OWNER"], [ADMIN, "ADMIN"], [MEMBER, "MEMBER"], [OTHER, "MEMBER"], [GUEST, "GUEST"]] as const) {
      this.roles.set(`${WS}:${u.id}`, role);
    }
  }

  assert(u: AuthUser, action: Action, workspaceId: string): Promise<ResolvedAccess> {
    const role = this.roles.get(`${workspaceId}:${u.id}`);
    if (!role) return Promise.reject(new ScopeNotFoundError());
    const actions = computeWorkspaceActions(role, this.archived ? "ARCHIVED" : "ACTIVE");
    if (!actions.has(action)) {
      if (role === "GUEST" && GUEST_HIDDEN_ACTIONS.has(action)) return Promise.reject(new ScopeNotFoundError());
      return Promise.reject(new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001));
    }
    return Promise.resolve({ visible: true, role, actions });
  }
}

export interface QuotaConfig {
  quotaBytes: number;
  retentionDays: number;
  overrides: Array<{ workspaceId: string; bytes: number }>;
}

export function makeHarness() {
  const clock = { now: new Date("2026-09-19T03:00:00.000Z") };
  const now = () => new Date(clock.now);
  const config: QuotaConfig = { quotaBytes: 10_000, retentionDays: 30, overrides: [] };
  const configReader: ResourceConfigReader = {
    getEffective: (key) =>
      Promise.resolve(
        key === "resource"
          ? { quotaOverrides: config.overrides }
          : { workspaceQuotaBytes: config.quotaBytes, trashRetentionDays: config.retentionDays }
      ),
  };

  const folders = new InMemoryFolderRepository();
  const resources = new InMemoryResourceRepository();
  const tx = new InMemoryTxRunner();
  const outbox = new InMemoryOutboxPort();
  const cache = new InMemoryResourceListCache();
  const access = new FakeAccess();
  const users = new InMemoryUserDirectory();
  const assets = new InMemoryAssetPort();
  const storageRepo = new InMemoryWorkspaceStorageRepository();
  storageRepo.used.set(WS, 0);
  const reservations = new InMemoryReservationStore();
  const quota = new StorageQuotaService(storageRepo, reservations, configReader);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const shared = { resources, folders, tx, outbox, cache, access, quota, users, assets, now };
  const usage = new StorageUsageService(resources, folders, quota);
  const purge = new ResourcePurgeService({ resources, folders, tx, outbox, cache, assets, quota, audit, now });

  for (const u of [OWNER, ADMIN, MEMBER, OTHER]) users.users.set(u.id, { id: u.id, name: `Người ${u.id.slice(-2)}`, avatarAssetId: null });

  let seq = 0;
  /** Asset READY trong kho giả (chủ = `owner`, thuộc `WS`). */
  const readyAsset = (owner: AuthUser, extra: Partial<AttachableAsset> = {}): AttachableAsset => {
    seq += 1;
    const id = `${seq.toString(16).padStart(24, "0")}`;
    const asset: AttachableAsset = {
      id,
      ownerId: owner.id,
      scope: "RESOURCE",
      variant: "ORIGINAL",
      workspaceId: WS,
      status: "READY",
      mime: "application/pdf",
      originalName: `tai-lieu-${seq}.pdf`,
      size: 1000,
      declaredSize: 1000,
      thumbnailAssetId: null,
      ...extra,
    };
    assets.assets.set(id, asset);
    return asset;
  };

  return {
    clock,
    config,
    folders,
    resources,
    outbox,
    cache,
    access,
    users,
    assets,
    storageRepo,
    reservations,
    quota,
    audit,
    purge,
    readyAsset,
    folderService: new FolderService({ folders, resources, tx, outbox, cache, access, quota, now }),
    resourceService: new ResourceService(shared),
    listService: new ResourceListService(shared),
    mutations: new ResourceMutationService(shared),
    trash: new TrashService({ folders, resources, users, assets, access, quota, usage, purge, now }),
  };
}

export type Harness = ReturnType<typeof makeHarness>;
