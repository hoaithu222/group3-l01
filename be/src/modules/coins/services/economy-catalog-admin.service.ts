import { ConflictError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import { DEFAULT_TIME_ZONE, addDaysToLocalDate, localDate } from "../../../core/utils/local-date";
import type { AuthUser } from "../../../core/types/express";
import { checkShopItemData } from "../domain/shop-item-data";
import type { CoinQuest, CoinRule, CoinSourceTypeValue, ShopItem, ShopItemKindValue } from "../entities/coins.interface";
import type { CreateQuestDto, CreateShopItemDto, PutRuleDto, UpdateQuestDto, UpdateShopItemDto } from "../dtos";
import { coinErrors } from "../coins.errors";
import type { ICoinEarnEventRepository } from "../repositories/earn-event.repository.interface";
import type { ICoinQuestRepository } from "../repositories/quest.repository.interface";
import type { ICoinRuleRepository } from "../repositories/rule.repository.interface";
import type { IInventoryRepository, IShopItemRepository, ShopItemPatch } from "../repositories/shop.repository.interface";
import type { CoinCatalogCache } from "./coin-catalog.service";
import type { ICoinsAudit } from "./coins.ports";
import { toAdminQuestDto, toAdminRuleDto, toAdminShopItemDto, type AdminQuestDto, type AdminRuleDto, type AdminShopItemDto } from "./coins-presenter";

export interface EconomyCatalogAdminDeps {
  items: IShopItemRepository;
  inventory: IInventoryRepository;
  rules: ICoinRuleRepository;
  quests: ICoinQuestRepository;
  earnEvents: ICoinEarnEventRepository;
  catalog: CoinCatalogCache;
  audit: ICoinsAudit;
  now?: () => Date;
}

const itemSnapshot = (i: ShopItem) => ({ name: i.name, price: i.price, isActive: i.isActive, availableFrom: i.availableFrom?.toISOString() ?? null, availableTo: i.availableTo?.toISOString() ?? null, version: i.version });
const ruleSnapshot = (r: CoinRule) => ({ coins: r.coins, dailyCap: r.dailyCap, isActive: r.isActive, version: r.version });
const questSnapshot = (q: CoinQuest) => ({ title: q.title, metric: q.metric, target: q.target, coins: q.coins, isActive: q.isActive, order: q.order, version: q.version });

/**
 * Admin cấu hình kinh tế (p7-02 admin.md §2.1): vật phẩm cửa hàng, luật thưởng xu, nhiệm vụ ngày. Quyền `gamification:view|update` do route kiểm; MỌI ghi có `reason` (DTO) + audit (trước/sau) + CAS `expectedVersion`
 * (`RES_003` khi lệch). Đổi luật/nhiệm vụ có hiệu lực ≤ 60 s (bộ nhớ đệm consumer), KHÔNG hồi tố; đổi GIÁ vật phẩm chỉ áp cho lần mua sau. `kind`/`code` không đổi được sau khi tạo.
 */
export class EconomyCatalogAdminService {
  private readonly now: () => Date;

  constructor(private readonly d: EconomyCatalogAdminDeps) {
    this.now = d.now ?? (() => new Date());
  }

  // ── vật phẩm ──────────────────────────────────────────────────────────────
  async listItems(kind?: ShopItemKindValue): Promise<AdminShopItemDto[]> {
    const [items, owners] = await Promise.all([this.d.items.listAll(kind), this.d.inventory.countByItem()]);
    return items.map((i) => toAdminShopItemDto(i, owners.get(i.id) ?? 0));
  }

  async createItem(actor: AuthUser, dto: CreateShopItemDto): Promise<AdminShopItemDto> {
    const checked = checkShopItemData(dto.kind, dto.data);
    if (!checked.ok) throw new ValidationError("Dữ liệu vật phẩm không hợp lệ", { data: checked.errors });
    const created = await this.d.items.create(
      { code: dto.code, name: dto.name, kind: dto.kind, price: dto.price, assetId: null, data: checked.data, isActive: dto.isActive, availableFrom: dto.availableFrom, availableTo: dto.availableTo },
      actor.id
    );
    if (!created) throw new ConflictError("Mã vật phẩm đã tồn tại");
    await this.audit(actor, "coins.shop-item.create", "ShopItem", created.id, dto.reason, { code: created.code, kind: created.kind, ...itemSnapshot(created) });
    return toAdminShopItemDto(created, 0);
  }

  async updateItem(actor: AuthUser, id: string, dto: UpdateShopItemDto): Promise<AdminShopItemDto> {
    const before = await this.d.items.find(id);
    if (!before) throw coinErrors.notFound("Không tìm thấy vật phẩm");
    const patch: ShopItemPatch = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.availableFrom !== undefined && { availableFrom: dto.availableFrom }),
      ...(dto.availableTo !== undefined && { availableTo: dto.availableTo }),
    };
    if (dto.data !== undefined) {
      const checked = checkShopItemData(before.kind, dto.data);
      if (!checked.ok) throw new ValidationError("Dữ liệu vật phẩm không hợp lệ", { data: checked.errors });
      patch.data = checked.data;
    }
    const from = patch.availableFrom === undefined ? before.availableFrom : patch.availableFrom;
    const to = patch.availableTo === undefined ? before.availableTo : patch.availableTo;
    if (from && to && from >= to) throw new ValidationError("Khung thời gian bán không hợp lệ", { availableTo: ["Thời gian kết thúc phải sau thời gian bắt đầu"] });

    const after = await this.d.items.updateIf(id, dto.expectedVersion, patch, actor.id);
    if (!after) throw new VersionConflictError((await this.d.items.find(id))?.version ?? before.version);
    await this.audit(actor, "coins.shop-item.update", "ShopItem", id, dto.reason, { before: itemSnapshot(before), after: itemSnapshot(after), dataChanged: dto.data !== undefined });
    return toAdminShopItemDto(after, (await this.d.inventory.countByItem()).get(id) ?? 0);
  }

  // ── luật thưởng xu ────────────────────────────────────────────────────────
  async listRules(): Promise<AdminRuleDto[]> {
    const today = localDate(this.now(), DEFAULT_TIME_ZONE);
    const [rules, issued] = await Promise.all([this.d.rules.listAll(), this.d.earnEvents.sumBySourceSince(addDaysToLocalDate(today, -6))]);
    return rules.map((r) => toAdminRuleDto(r, issued.get(r.sourceType) ?? 0));
  }

  /** Tạo luật (chưa có; `expectedVersion` phải 0) hoặc sửa (CAS theo `version`). */
  async putRule(actor: AuthUser, sourceType: CoinSourceTypeValue, dto: PutRuleDto): Promise<AdminRuleDto> {
    const before = await this.d.rules.find(sourceType);
    const write = { coins: dto.coins, dailyCap: dto.dailyCap, isActive: dto.isActive };
    let after: CoinRule | null;
    if (!before) {
      if (dto.expectedVersion !== 0) throw new VersionConflictError(0);
      after = await this.d.rules.create(sourceType, write, actor.id);
      if (!after) throw new VersionConflictError((await this.d.rules.find(sourceType))?.version ?? 1);
    } else {
      after = await this.d.rules.updateIf(sourceType, dto.expectedVersion, write, actor.id);
      if (!after) throw new VersionConflictError((await this.d.rules.find(sourceType))?.version ?? before.version);
    }
    this.d.catalog.invalidate();
    await this.audit(actor, "coins.rule.update", "CoinRule", sourceType, dto.reason, { before: before ? ruleSnapshot(before) : null, after: ruleSnapshot(after) });
    return toAdminRuleDto(after, 0);
  }

  // ── nhiệm vụ ngày ─────────────────────────────────────────────────────────
  async listQuests(): Promise<AdminQuestDto[]> {
    return (await this.d.quests.listAll()).map(toAdminQuestDto);
  }

  async createQuest(actor: AuthUser, dto: CreateQuestDto): Promise<AdminQuestDto> {
    const created = await this.d.quests.create(
      { code: dto.code, title: dto.title, description: dto.description, metric: dto.metric, target: dto.target, coins: dto.coins, isActive: dto.isActive, order: dto.order },
      actor.id
    );
    if (!created) throw new ConflictError("Mã nhiệm vụ đã tồn tại");
    this.d.catalog.invalidate();
    await this.audit(actor, "coins.quest.create", "CoinQuest", created.id, dto.reason, { code: created.code, ...questSnapshot(created) });
    return toAdminQuestDto(created);
  }

  async updateQuest(actor: AuthUser, id: string, dto: UpdateQuestDto): Promise<AdminQuestDto> {
    const before = await this.d.quests.find(id);
    if (!before) throw coinErrors.notFound("Không tìm thấy nhiệm vụ");
    const patch = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.metric !== undefined && { metric: dto.metric }),
      ...(dto.target !== undefined && { target: dto.target }),
      ...(dto.coins !== undefined && { coins: dto.coins }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.order !== undefined && { order: dto.order }),
    };
    const after = await this.d.quests.updateIf(id, dto.expectedVersion, patch, actor.id);
    if (!after) throw new VersionConflictError((await this.d.quests.find(id))?.version ?? before.version);
    this.d.catalog.invalidate();
    await this.audit(actor, "coins.quest.update", "CoinQuest", id, dto.reason, { before: questSnapshot(before), after: questSnapshot(after) });
    return toAdminQuestDto(after);
  }

  private audit(actor: AuthUser, action: string, targetType: string, targetId: string, reason: string, metadata: Record<string, unknown>): Promise<void> {
    return this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action, targetType, targetId, reason, metadata });
  }
}
