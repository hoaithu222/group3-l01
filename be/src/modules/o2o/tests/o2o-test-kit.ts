/**
 * Bộ dựng unit test cho service `o2o` — repo in-memory + cổng giả (asset, quyền Resource, thông báo, audit, khoá PIN, đồng hồ).
 * KHÔNG phải test (không khớp `*.test.ts`).
 */
import { newObjectId } from "../../../core/utils/object-id";
import type { AuthUser } from "../../../core/types/express";
import type { NotifyInput } from "../../notifications/public";
import { buildO2oServices } from "../o2o.services";
import { InMemoryLocationRepository, InMemoryLocationReviewRepository } from "../repositories/location.repository.inmemory";
import { InMemoryPrintOrderRepository, InMemoryPrintShopRepository } from "../repositories/print.repository.inmemory";
import { InMemoryOutboxPort, InMemoryTxRunner } from "../repositories/tx";
import type { DirectoryUser, IO2oDirectory, ResourceSnapshot } from "../repositories/o2o-directory";
import type { IO2oAccess, IO2oAssetPort, O2oAssetInfo, O2oDeps } from "../services/o2o.deps";
import { InMemoryPinLockout } from "../services/pin-lockout";
import type { PrintPriceTable } from "../entities/o2o.interface";

export const user = (id: string = newObjectId(), role = "user"): AuthUser => ({ id, email: `${id}@e.com`, name: "Tên", role });

/** PDF tối thiểu hợp lệ với `pages` trang (cây trang phẳng, không nén). */
export function makePdf(pages: number): Buffer {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ");
  const pageObjs = Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj`);
  return Buffer.from(
    ["%PDF-1.4", "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj", `2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages} >> endobj`, ...pageObjs, "trailer << /Root 1 0 R >>", "%%EOF"].join("\n"),
    "latin1"
  );
}

export class FakeAssets implements IO2oAssetPort {
  readonly assets = new Map<string, O2oAssetInfo>();
  readonly files = new Map<string, Buffer>();
  readonly links: Array<{ assetIds: string[]; targetType: string; targetId: string; scopeType: string; foreign?: boolean }> = [];
  readonly detached: Array<{ targetType: string; targetId: string; assetIds?: string[] }> = [];
  readonly signed: Array<{ assetId: string; userId: string }> = [];

  add(ownerId: string, over: Partial<O2oAssetInfo> = {}, content: Buffer = makePdf(12)): O2oAssetInfo {
    const a: O2oAssetInfo = { id: newObjectId(), ownerId, status: "READY", scope: "PRINT", kind: "FILE", mime: "application/pdf", size: content.length, storageKey: `k/${newObjectId()}`, originalName: "bai-tap.pdf", ...over };
    this.assets.set(a.id, a);
    this.files.set(a.storageKey, content);
    return a;
  }
  async get(id: string) {
    return this.assets.get(id) ?? null;
  }
  async read(a: O2oAssetInfo) {
    return this.files.get(a.storageKey) ?? Buffer.alloc(0);
  }
  async attach(_tx: unknown, input: { assetIds: string[]; targetType: string; targetId: string; scopeType: string; foreign?: boolean }) {
    this.links.push(input);
  }
  async detach(_tx: unknown, input: { targetType: string; targetId: string; assetIds?: string[] }) {
    this.detached.push(input);
  }
  async signedUrl(assetId: string, u: AuthUser) {
    this.signed.push({ assetId, userId: u.id });
    return { url: `https://files.test/${assetId}`, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }
  async signPhotos(ids: string[]) {
    return ids.map((assetId) => ({ assetId, url: `https://files.test/${assetId}`, thumbUrl: null, expiresAt: null }));
  }
}

export class FakeDirectory implements IO2oDirectory {
  readonly users = new Map<string, DirectoryUser>();
  readonly resources = new Map<string, ResourceSnapshot>();
  addUser(role = "user", status = "ACTIVE"): DirectoryUser {
    const id = newObjectId();
    const u = { id, name: `Người ${id.slice(-4)}`, email: `${id}@e.com`, role, status };
    this.users.set(id, u);
    return u;
  }
  async findUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findUser(id: string) {
    return this.users.get(id) ?? null;
  }
  async usersByIds(ids: string[]) {
    return new Map(ids.flatMap((id) => (this.users.has(id) ? [[id, this.users.get(id) as DirectoryUser] as const] : [])));
  }
  async findResource(id: string) {
    return this.resources.get(id) ?? null;
  }
}

export class FakeAccess implements IO2oAccess {
  readonly readers = new Set<string>();
  async canReadResource(u: AuthUser, workspaceId: string) {
    return this.readers.has(`${workspaceId}:${u.id}`);
  }
}

export const PRICES: PrintPriceTable = { a4Bw: 500, a4Color: 2000, a3Bw: 1000, a3Color: 4000, duplexDiscountPct: 10, minOrder: 2000 };

export function makeKit(start = new Date("2026-09-25T03:00:00.000Z")) {
  let nowMs = start.getTime();
  const notifications: NotifyInput[] = [];
  const audits: Array<{ action: string; targetId: string; reason?: string }> = [];
  const invalidated: string[] = [];
  const outbox = new InMemoryOutboxPort();
  const deps: O2oDeps = {
    locations: new InMemoryLocationRepository(),
    reviews: new InMemoryLocationReviewRepository(),
    shops: new InMemoryPrintShopRepository(),
    orders: new InMemoryPrintOrderRepository(() => new Date(nowMs)),
    directory: new FakeDirectory(),
    access: new FakeAccess(),
    assets: new FakeAssets(),
    pinLockout: new InMemoryPinLockout(() => nowMs),
    notifier: { notify: async (_tx, input) => void notifications.push(input) },
    audit: { record: async (input) => void audits.push(input) },
    dataPermissions: { invalidate: async (id) => void invalidated.push(id) },
    tx: new InMemoryTxRunner(),
    outbox,
    now: () => new Date(nowMs),
  };
  const services = buildO2oServices(deps);
  const kit = {
    deps,
    services,
    notifications,
    audits,
    invalidated,
    outbox,
    assets: deps.assets as FakeAssets,
    directory: deps.directory as FakeDirectory,
    access: deps.access as FakeAccess,
    advance: (ms: number) => void (nowMs += ms),
    /** Địa điểm PRINT_SHOP + tiệm APPROVED của một chủ tiệm mới. */
    async shop(over: { acceptingOrders?: boolean; capabilities?: Partial<{ color: boolean; duplex: boolean; a3: boolean; binding: boolean }> } = {}) {
      const owner = kit.directory.addUser();
      const loc = await deps.locations.create({ name: "Tiệm in Bách Khoa", normalizedName: "tiem in bach khoa", address: "1 Đại Cồ Việt", lat: 21.005, lng: 105.843, type: "PRINT_SHOP", amenities: [], openHours: [], photoAssetIds: [], createdBy: owner.id });
      const created = await deps.shops.create({ locationId: loc.id, ownerUserId: owner.id, displayName: "Tiệm A", phone: null, priceTable: PRICES, capabilities: { color: true, duplex: true, a3: true, binding: false, ...over.capabilities } });
      const shop = await deps.shops.setStatus(created.id, ["PENDING"], { status: "APPROVED", approvedBy: owner.id, approvedAt: new Date(nowMs) });
      if (over.acceptingOrders === false) await deps.shops.setAccepting(created.id, owner.id, false);
      return { owner: user(owner.id), shop: shop!, location: loc };
    },
    /** Đơn đã đếm trang + báo giá (QUOTED) từ PDF `pages` trang tự tải lên. */
    async quotedOrder(shopId: string, pages = 12, settings = { paper: "A4" as const, color: true, copies: 1, duplex: true, binding: false }) {
      const customer = user(kit.directory.addUser().id);
      const asset = kit.assets.add(customer.id, {}, makePdf(pages));
      const draft = await services.orders.create(customer, { shopId, source: { kind: "UPLOAD", assetId: asset.id }, settings });
      await services.pageCount.handle({ orderId: draft.id, assetId: asset.id });
      return { customer, orderId: draft.id, asset };
    },
  };
  return kit;
}
export type Kit = ReturnType<typeof makeKit>;
