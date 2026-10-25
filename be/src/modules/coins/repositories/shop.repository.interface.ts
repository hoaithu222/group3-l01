import type { InventoryItem, ShopItem, ShopItemKindValue, ShopItemWrite } from "../entities/coins.interface";
import type { TxHandle } from "./tx";

/** `code` không đổi được sau khi tạo (kho đồ/thống kê tham chiếu theo id, nhưng admin nhận diện bằng mã). */
export type ShopItemPatch = Partial<Omit<ShopItemWrite, "code">>;

export interface IShopItemRepository {
  /** Vật phẩm đang bật (`isActive`) — khung thời gian bán do service lọc bằng `isOnSale` (mốc `null` không phụ thuộc cách Mongo so `null`/vắng mặt). */
  listActive(kind?: ShopItemKindValue): Promise<ShopItem[]>;
  listAll(kind?: ShopItemKindValue): Promise<ShopItem[]>;
  find(id: string, tx?: TxHandle): Promise<ShopItem | null>;
  findMany(ids: readonly string[]): Promise<ShopItem[]>;
  /** `null` khi trùng `code` (unique). */
  create(data: ShopItemWrite, actorId: string): Promise<ShopItem | null>;
  /** CAS theo `version`: `null` khi lệch/không có. Chỉ các trường có trong `patch` được ghi. */
  updateIf(id: string, expectedVersion: number, patch: ShopItemPatch, actorId: string): Promise<ShopItem | null>;
}

export interface IInventoryRepository {
  findByItem(userId: string, itemId: string, tx?: TxHandle): Promise<InventoryItem | null>;
  findById(id: string, tx?: TxHandle): Promise<InventoryItem | null>;
  listByUser(userId: string, kind?: ShopItemKindValue): Promise<InventoryItem[]>;
  /** Ném `UniqueViolationError("UserInventory")` khi người này đã có vật phẩm (mua lại). */
  create(input: { userId: string; itemId: string; kind: ShopItemKindValue }, tx: TxHandle): Promise<InventoryItem>;
  /**
   * Đặt `equipped = false` cho MỌI dòng cùng `kind` của người này (kể cả dòng sắp trang bị — service bật lại ngay sau đó). Cố ý ghi MỌI dòng cùng loại (không chỉ dòng đang trang bị): hai lần
   * "trang bị" song song hai vật phẩm cùng loại sẽ cùng ghi một tập document ⇒ write-conflict ⇒ chạy lần lượt; nếu chỉ ghi dòng đang trang bị thì hai giao dịch ghi hai document rời nhau
   * (write-skew) và cuối cùng CẢ HAI cùng "đang trang bị".
   */
  unequipKind(userId: string, kind: ShopItemKindValue, tx: TxHandle): Promise<void>;
  setEquipped(id: string, userId: string, equipped: boolean, tx: TxHandle): Promise<InventoryItem | null>;
  /** Vật phẩm đang trang bị của nhiều người (hồ sơ công khai qua `public.ts`). */
  equippedByUsers(userIds: readonly string[]): Promise<InventoryItem[]>;
  /** Số người sở hữu theo vật phẩm (cột "bán ra"/"top vật phẩm" của admin). */
  countByItem(): Promise<Map<string, number>>;
}
