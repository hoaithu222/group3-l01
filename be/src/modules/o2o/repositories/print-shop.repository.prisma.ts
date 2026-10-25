import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { escapeRegex } from "../../../core/utils/escape-regex";
import type { PrintShop, PrintShopStatus } from "../entities/o2o.interface";
import type {
  AdminShopFilter,
  IPrintShopRepository,
  ShopCreateInput,
  ShopPatch,
  ShopStatusPatch,
} from "./print-shop.repository.interface";
import { toShop } from "./o2o.mappers";
import type { TxHandle } from "./tx";

const db = (tx?: TxHandle) => tx ?? prisma;

export class PrismaPrintShopRepository implements IPrintShopRepository {
  async findById(id: string): Promise<PrintShop | null> {
    const r = await prisma.printShop.findUnique({ where: { id } });
    return r ? toShop(r) : null;
  }

  async findByLocationId(locationId: string): Promise<PrintShop | null> {
    const r = await prisma.printShop.findUnique({ where: { locationId } });
    return r ? toShop(r) : null;
  }

  async findByLocationIds(locationIds: string[]): Promise<PrintShop[]> {
    if (locationIds.length === 0) return [];
    return (await prisma.printShop.findMany({ where: { locationId: { in: locationIds } } })).map(toShop);
  }

  async listByOwner(ownerUserId: string): Promise<PrintShop[]> {
    return (await prisma.printShop.findMany({ where: { ownerUserId }, orderBy: { createdAt: "asc" } })).map(toShop);
  }

  async hasApprovedForOwner(ownerUserId: string): Promise<boolean> {
    return (await prisma.printShop.count({ where: { ownerUserId, status: "APPROVED" } })) > 0;
  }

  async create(input: ShopCreateInput, tx?: TxHandle): Promise<PrintShop> {
    const r = await db(tx).printShop.create({
      data: {
        ...input,
        status: "PENDING",
        approvedBy: null,
        approvedAt: null,
        suspendedReason: null,
        acceptingOrders: true,
      },
    });
    return toShop(r);
  }

  async update(id: string, expectedVersion: number, patch: ShopPatch, tx?: TxHandle): Promise<PrintShop | null> {
    const data: Prisma.PrintShopUpdateManyMutationInput = {
      ...(patch.displayName !== undefined && { displayName: patch.displayName }),
      ...(patch.phone !== undefined && { phone: patch.phone }),
      ...(patch.priceTable !== undefined && { priceTable: patch.priceTable }),
      ...(patch.capabilities !== undefined && { capabilities: patch.capabilities }),
      ...(patch.acceptingOrders !== undefined && { acceptingOrders: patch.acceptingOrders }),
      version: { increment: 1 },
    };
    const res = await db(tx).printShop.updateMany({ where: { id, version: expectedVersion }, data });
    if (res.count === 0) return null;
    const r = await db(tx).printShop.findUnique({ where: { id } });
    return r ? toShop(r) : null;
  }

  async setStatus(id: string, from: readonly PrintShopStatus[], patch: ShopStatusPatch, tx?: TxHandle): Promise<PrintShop | null> {
    const res = await db(tx).printShop.updateMany({
      where: { id, status: { in: [...from] } },
      data: {
        status: patch.status,
        ...(patch.approvedBy !== undefined && { approvedBy: patch.approvedBy }),
        ...(patch.approvedAt !== undefined && { approvedAt: patch.approvedAt }),
        ...(patch.suspendedReason !== undefined && { suspendedReason: patch.suspendedReason }),
      },
    });
    if (res.count === 0) return null;
    const r = await db(tx).printShop.findUnique({ where: { id } });
    return r ? toShop(r) : null;
  }

  async setAccepting(id: string, ownerUserId: string, acceptingOrders: boolean): Promise<PrintShop | null> {
    const res = await prisma.printShop.updateMany({ where: { id, ownerUserId }, data: { acceptingOrders } });
    return res.count === 0 ? null : this.findById(id);
  }

  async listAdmin(f: AdminShopFilter): Promise<{ data: PrintShop[]; total: number }> {
    const where: Prisma.PrintShopWhereInput = {
      ...(f.status && { status: f.status }),
      ...(f.q && { displayName: { contains: escapeRegex(f.q), mode: "insensitive" } }),
    };
    const [rows, total] = await Promise.all([
      prisma.printShop.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (f.page - 1) * f.limit, take: f.limit }),
      prisma.printShop.count({ where }),
    ]);
    return { data: rows.map(toShop), total };
  }
}
