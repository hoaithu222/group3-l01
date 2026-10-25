/**
 * Kiểu DTO của backend Resource Hub — ĐÃ đối chiếu với mã BE thật
 * (`be/src/modules/resources/services/resource.presenter.ts`, `trash.service.ts`,
 * `storage-usage.service.ts`, `folder.service.ts`; be.md §4 + §12).
 *
 * ⚠️ Chưa có công cụ sinh kiểu OpenAPI (p0-09) — viết TAY, khai ĐỘC LẬP với mọi
 * feature khác. Lệch với BE là lỗi của phía app: `tests/contract/*` giữ các fixture
 * có hình dạng đúng như BE trả để lệch sau này bị bắt.
 */

export const RESOURCE_TYPES = [
  'PDF',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'CODE',
  'DOC',
  'SHEET',
  'SLIDE',
  'TEXT',
  'OTHER',
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type PreviewStatus = 'NONE' | 'NATIVE' | 'PENDING' | 'READY' | 'FAILED' | 'UNSUPPORTED';

export type ResourceSort = 'createdAt' | 'name' | 'size';
export type SortOrder = 'asc' | 'desc';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
export type WorkspaceStatus = 'ACTIVE' | 'ARCHIVED';

/** Thư mục gốc không có id — dùng chuỗi này (`GET /resources?folderId=root`, khoá cache). */
export const ROOT_FOLDER = 'root' as const;
export type FolderRef = string | typeof ROOT_FOLDER;

export interface ResourceUploader {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** `GET /workspaces/:id/folders` → `children[]`, `breadcrumb[]`, `folder`. */
export interface FolderDto {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  /** Gốc = 1. */
  depth: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Chỉ khác `null` trong thùng rác. */
  deletedAt: string | null;
  /**
   * Server tính: người xem có đổi tên/di chuyển/xoá thư mục này không (của mình cần
   * `workspace.folder.manage`, của người khác cần `workspace.resource.delete`). Client
   * KHÔNG tự suy từ vai trò — chỉ đọc cờ này.
   */
  canModify: boolean;
}

export interface ResourceDto {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  extension: string | null;
  type: ResourceType;
  /** CODE: ngôn ngữ tô màu do server suy từ đuôi. */
  language: string | null;
  mime: string;
  size: number;
  description: string | null;
  tags: string[];
  previewStatus: PreviewStatus;
  /**
   * Ảnh: URL ký thumbnail ≤ 60 s (sinh lúc trả lời) — KHÔNG lưu lâu, `expo-image`
   * `cachePolicy: 'none'`. `null` với tệp không phải ảnh và với mọi tệp trong thùng rác.
   */
  thumbnailUrl: string | null;
  /** `avatarUrl` luôn `null` ở BE hiện tại (chưa có helper đổi `avatarAssetId` → URL ký). */
  uploadedBy: ResourceUploader;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Chỉ khác `null` trong thùng rác. */
  deletedAt: string | null;
  /** Server tính, cùng nghĩa với `FolderDto.canModify` (của mình / của người khác). */
  canModify: boolean;
  /**
   * ⚠️ NGOÀI hợp đồng BE: kết quả TÌM (`q`) trải toàn workspace nên muốn hiện tệp nằm
   * ở đâu. BE p3-01 CHƯA trả trường này (chỉ `folderId`) — `ResourceListItem` tự hiện
   * nếu BE thêm đường dẫn chữ ("Slide / Tuần 1"); thiếu thì chỉ có hành động
   * "Mở thư mục chứa tệp". Còn mở: cần BE quyết.
   */
  folderPath?: string | null;
}

/** 4 action tệp mà `GET /resources/:id` trả trong `myPermissions` (BE `MY_PERMISSION_SUBSET`). */
export type ResourceAction =
  | 'workspace.folder.manage'
  | 'workspace.resource.delete'
  | 'workspace.resource.read'
  | 'workspace.resource.upload';

/**
 * `GET /resources/:id` = `ResourceDto & { myPermissions: Action[] }`. `myPermissions`
 * chỉ có ở phản hồi chi tiết — bản ghi chèn từ danh sách/`POST` vào cache chi tiết
 * (`insertCreatedResource`) không có, nên để tuỳ chọn; quyền theo MỤC dùng `canModify`.
 */
export interface ResourceDetailDto extends ResourceDto {
  myPermissions?: ResourceAction[];
}

/**
 * `folder` VẮNG MẶT khi liệt kê gốc. `breadcrumb` = TỔ TIÊN từ gốc → cha, KHÔNG gồm
 * `folder` (nên tên thư mục hiện tại nối vào cuối ở `buildBreadcrumb`). `children` ≤ 500, sắp theo tên.
 */
export interface FolderListing {
  folder?: FolderDto;
  breadcrumb: FolderDto[];
  children: FolderDto[];
}

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ResourcePage {
  items: ResourceDto[];
  meta: CursorMeta;
}

/** Tham số danh sách — mọi thứ ảnh hưởng kết quả (nằm trong queryKey). */
export interface ResourceListParams {
  /** Bỏ trống khi `q` có — BE tìm toàn workspace. */
  folderId?: FolderRef;
  q?: string;
  type?: ResourceType;
  sort: ResourceSort;
  order: SortOrder;
}

export interface CreateFolderPayload {
  name: string;
  parentId?: string;
}

export interface UpdateFolderPayload {
  name?: string;
  /** `null` = về gốc. */
  parentId?: string | null;
  expectedVersion: number;
}

export interface CreateResourcePayload {
  assetId: string;
  folderId?: string;
  name?: string;
  description?: string;
  tags?: string[];
}

export interface UpdateResourcePayload {
  name?: string;
  description?: string;
  tags?: string[];
  /** `null` = về gốc. */
  folderId?: string | null;
  expectedVersion: number;
}

export type ResourceUrlVariant = 'original' | 'preview' | 'download';

export interface ResourceUrlDto {
  url: string;
  expiresAt: string;
  mime: string;
  disposition: 'attachment' | 'inline';
}

/** Mục thùng rác = DTO + 3 trường server tính. `purgeAt` = thời điểm bị xoá vĩnh viễn (ISO). */
export interface TrashMeta {
  canPurge: boolean;
  canRestore: boolean;
  purgeAt: string;
}
export type TrashFolderDto = FolderDto & TrashMeta;
export type TrashResourceDto = ResourceDto & TrashMeta;

/**
 * `GET /workspaces/:id/trash`: `data: { folders, resources }` + `meta` cursor CÙNG CẤP `data`.
 * Chỉ liệt kê GỐC của mỗi lô xoá; một trang có thể ngắn hơn `limit` (thậm chí rỗng) mà
 * `meta.hasMore` vẫn `true` — nơi gọi phải tiếp tục lấy trang kế tiếp.
 */
export interface TrashPage {
  folders: TrashFolderDto[];
  resources: TrashResourceDto[];
  meta: CursorMeta;
}

export interface StorageByType {
  type: ResourceType;
  count: number;
  bytes: number;
}

export type QuotaSource = 'DEFAULT' | 'OVERRIDE';

export interface StorageUsageDto {
  usedBytes: number;
  quotaBytes: number;
  quotaSource: QuotaSource;
  fileCount: number;
  folderCount: number;
  /** Byte trong thùng rác — VẪN tính vào `usedBytes` tới khi xoá vĩnh viễn. */
  trashBytes: number;
  byType: StorageByType[];
}

/** Payload `resource:changed` (S→C `ws:{id}`) — không tên tệp; `folderId` = thư mục CHỨA mục bị đổi (`null` = gốc). */
export interface ResourceChangedPayload {
  action: 'CREATED' | 'DELETED' | 'UPDATED';
  folderId: string | null;
  kind: 'FOLDER' | 'RESOURCE';
  /** Tệp: id tệp; thư mục: id thư mục bị đổi. */
  subjectId?: string;
  workspaceId: string;
}

/**
 * Phần `GET /workspaces/:id` mà Resource Hub cần — khai ĐỘC LẬP với feature
 * `workspaces` (cùng cách `channels/useCanCreateChannel`).
 */
export interface WorkspaceAccess {
  id: string;
  name: string;
  status: WorkspaceStatus;
  myRole: WorkspaceRole;
}
