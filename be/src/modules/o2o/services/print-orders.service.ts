import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import { beforeOf, cursorPage } from "./cursor-page";
import { DEFAULT_PRINT_SETTINGS, type PrintOrder, type PrintOrderStatus, type PrintShop } from "../entities/o2o.interface";
import { canPerform } from "../domain/print-order.state-machine";
import { generateOrderCode } from "../domain/pickup-pin";
import type { CreateOrderDto, MyOrdersQueryDto, OrderGroup, UpdateOrderDto } from "../dtos";
import { o2oErrors } from "../o2o.errors";
import type { O2oDeps, O2oAssetInfo } from "./o2o.deps";
import { OrderViews } from "./order-views";
import { PrintOrderTransitioner } from "./print-order-transitioner";
import { assertSettingsSupported, quoteOrThrow, toSettings } from "./print-quote.helper";

const PDF = "application/pdf";
const CODE_ATTEMPTS = 5;
export const COUNT_PAGES_JOB = "print.count-pages";

const GROUP_STATUSES: Record<OrderGroup, readonly PrintOrderStatus[]> = {
  ACTIVE: ["DRAFT", "QUOTED", "PENDING", "ACCEPTED", "PRINTING", "READY"],
  DONE: ["PICKED_UP"],
  CLOSED: ["REJECTED", "CANCELLED", "EXPIRED"],
};

const isUniqueViolation = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";

/** Đơn in phía chủ đơn (be.md §4): tạo (DRAFT + job đếm trang), sửa cấu hình (báo giá lại), xem, danh sách. */
export class PrintOrdersService {
  private readonly views: OrderViews;
  private readonly transitioner: PrintOrderTransitioner;

  constructor(private readonly deps: O2oDeps) {
    this.views = new OrderViews(deps);
    this.transitioner = new PrintOrderTransitioner(deps);
  }

  async create(user: AuthUser, dto: CreateOrderDto) {
    const shop = await this.deps.shops.findById(dto.shopId);
    if (!shop || shop.status !== "APPROVED") throw o2oErrors.notFound();
    if (!shop.acceptingOrders) throw o2oErrors.shopNotAccepting();
    const settings = dto.settings ? toSettings(dto.settings) : { ...DEFAULT_PRINT_SETTINGS };
    assertSettingsSupported(settings, shop);
    const src = await this.resolveSource(user, dto.source);

    for (let attempt = 1; ; attempt += 1) {
      try {
        const order = await this.deps.tx.run(async (tx) => {
          const created = await this.deps.orders.create(
            {
              code: generateOrderCode(),
              userId: user.id,
              shopId: shop.id,
              shopOwnerId: shop.ownerUserId,
              workspaceId: src.workspaceId,
              source: { kind: dto.source.kind, resourceId: src.resourceId, assetId: src.asset.id },
              fileAssetId: src.asset.id,
              fileName: src.fileName,
              settings,
              pickupBy: dto.pickupBy ?? null,
              event: { status: "DRAFT", at: this.deps.now(), by: user.id, note: null },
            },
            tx
          );
          await this.deps.assets.attach(tx, {
            assetIds: [src.asset.id],
            targetType: "PRINT_ORDER",
            targetId: created.id,
            scopeType: "NONE",
            actorId: user.id,
            foreign: src.asset.ownerId !== user.id,
          });
          await this.deps.outbox.add(tx, {
            type: COUNT_PAGES_JOB,
            aggregateType: "PrintOrder",
            aggregateId: created.id,
            queue: "media",
            jobName: COUNT_PAGES_JOB,
            payload: { orderId: created.id, assetId: src.asset.id },
            dedupeKey: `${COUNT_PAGES_JOB}:${created.id}:${src.asset.id}`,
          });
          return created;
        });
        return (await this.views.customer([order]))[0];
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= CODE_ATTEMPTS) throw err;
      }
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateOrderDto) {
    const order = await this.own(user, id);
    if (!canPerform("UPDATE_SETTINGS", order.status)) throw o2oErrors.invalidState(order.status);
    if (order.version !== dto.expectedVersion) throw o2oErrors.versionConflict(order.version);
    const shop = await this.shopOf(order);
    const settings = toSettings(dto.settings);
    assertSettingsSupported(settings, shop);
    const quote = order.pages !== null ? quoteOrThrow(order.pages, settings, shop, this.deps.now()) : null;
    const tooMany = order.pages !== null && order.pages > LIMITS.o2o.orderPagesMax;
    const updated = await this.transitioner.apply(order, "UPDATE_SETTINGS", {
      actorId: user.id,
      set: {
        settings,
        ...(dto.pickupBy !== undefined && { pickupBy: dto.pickupBy }),
        ...(quote && !tooMany && { quote, status: "QUOTED" as const, pageCountError: null }),
      },
    });
    return (await this.views.customer([updated]))[0];
  }

  async get(user: AuthUser, id: string) {
    return (await this.views.customer([await this.own(user, id)]))[0];
  }

  async listMine(user: AuthUser, q: MyOrdersQueryDto) {
    const statuses = q.group ? GROUP_STATUSES[q.group] : undefined;
    const rows = await this.deps.orders.listByUser(user.id, { statuses, before: beforeOf(q.cursor), limit: q.limit + 1 });
    const { page, meta } = cursorPage(rows, q.limit);
    return { data: await this.views.customer(page), meta };
  }

  /** Chủ đơn — đơn của người khác → 404 trung tính. */
  async own(user: AuthUser, id: string): Promise<PrintOrder> {
    const order = await this.deps.orders.findById(id);
    if (!order || order.userId !== user.id) throw o2oErrors.notFound();
    return order;
  }

  private async shopOf(order: PrintOrder): Promise<PrintShop> {
    const shop = await this.deps.shops.findById(order.shopId);
    if (!shop) throw o2oErrors.notFound();
    return shop;
  }

  /** RESOURCE: kiểm `workspace.resource.read` rồi chụp asset HIỆN TẠI (README §2 "Nguồn tệp"); UPLOAD: asset của chính mình. */
  private async resolveSource(user: AuthUser, source: CreateOrderDto["source"]) {
    let assetId: string;
    let resourceId: string | null = null;
    let workspaceId: string | null = null;
    let fileName: string | null = null;
    if (source.kind === "RESOURCE") {
      const res = await this.deps.directory.findResource(source.resourceId);
      if (!res || res.deleted || !(await this.deps.access.canReadResource(user, res.workspaceId))) throw o2oErrors.notFound();
      assetId = res.assetId;
      workspaceId = res.workspaceId;
      fileName = res.name;
      resourceId = res.id;
    } else {
      assetId = source.assetId;
    }
    const asset = await this.deps.assets.get(assetId);
    if (!asset || (source.kind === "UPLOAD" && asset.ownerId !== user.id)) throw o2oErrors.notFound();
    this.assertPrintable(asset);
    return { asset, resourceId, workspaceId, fileName: fileName ?? asset.originalName };
  }

  private assertPrintable(asset: O2oAssetInfo): void {
    if (asset.status !== "READY") throw o2oErrors.invalidFile("NOT_READY");
    if (asset.mime !== PDF) throw o2oErrors.invalidFile("NOT_PDF");
    if (asset.size !== null && asset.size > LIMITS.o2o.fileMaxBytes) throw o2oErrors.invalidFile("TOO_LARGE");
  }
}
