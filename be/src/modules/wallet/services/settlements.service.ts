import { withTransaction } from "../../../infrastructure/database";
import { ScopeForbiddenError, ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { AuthUser } from "../../../core/types/express";
import { notify } from "../../notifications/public";
import type { AssetLinkService } from "../../assets/public";
import { generateSettlementCode } from "../domain/vietqr-reference";
import type { Settlement, SettlementView } from "../entities/wallet.interface";
import type { CreateSettlementDto, ListSettlementsQueryDto } from "../dtos";
import type { ISettlementRepository, SettlementTransition } from "../repositories/settlement.repository.interface";
import type { IWalletDirectory } from "../repositories/wallet-directory.interface";
import type { IWalletRepository, Tx } from "../repositories/wallet.repository.interface";
import "./wallet-notifications";
import { assertWalletRole, assertWorkspaceWritable } from "./wallet-access";
import { assertActiveMembers, assertAssetReady, walletError } from "./expense-helpers";
import type { CursorPage } from "./expenses.service";
import { toSettlementView } from "./wallet-presenter";
import type { WalletProjectionService } from "./wallet-projection.service";
import { emitWalletUpdated } from "./wallet-support";

const CODE_ATTEMPTS = 5;

/** Vòng đời settlement (be.md §5): tạo (PENDING) → người nhận xác nhận/từ chối, người gửi huỷ. Chỉ CONFIRMED mới đổi số dư. */
export class SettlementsService {
  constructor(
    private readonly settlementRepo: ISettlementRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly directory: IWalletDirectory,
    private readonly projection: WalletProjectionService,
    private readonly assetLink: AssetLinkService
  ) {}

  async create(actor: AuthUser, workspaceId: string, dto: CreateSettlementDto): Promise<SettlementView> {
    await assertWalletRole(actor, workspaceId);
    await assertWorkspaceWritable(this.directory, workspaceId);
    if (dto.toId === actor.id) throw walletError(ErrorCode.WALLET_006, 400);
    await assertActiveMembers(this.directory, workspaceId, [dto.toId]);
    await assertAssetReady(this.directory, dto.proofAssetId, actor.id);

    await this.walletRepo.ensureSettings(workspaceId);
    const workspaceName = await this.directory.workspaceName(workspaceId);
    const code = await this.uniqueCode(dto.reference);

    return withTransaction(async (tx) => {
      const balances = await this.balancesOf(workspaceId, [actor.id, dto.toId], tx);
      // Không trả thừa, không tạo nợ ngược: ≤ min(nợ của người gửi, số được nợ của người nhận).
      if (dto.amount > Math.max(0, -balances.get(actor.id)!) || dto.amount > Math.max(0, balances.get(dto.toId)!)) {
        throw walletError(ErrorCode.WALLET_005, 400);
      }

      const settlement = await this.settlementRepo.create(
        {
          workspaceId,
          code,
          fromId: actor.id,
          toId: dto.toId,
          amount: dto.amount,
          method: dto.method,
          proofAssetId: dto.proofAssetId ?? null,
          note: dto.note ?? null,
          createdBy: actor.id,
        },
        tx
      );
      if (dto.proofAssetId) {
        await this.assetLink.attach(tx, {
          assetIds: [dto.proofAssetId],
          targetType: "SETTLEMENT_PROOF",
          targetId: settlement.id,
          scopeType: "WORKSPACE",
          scopeId: workspaceId,
          actorId: actor.id,
        });
      }
      await this.notifyParty(tx, "wallet.settlement-pending", settlement, dto.toId, actor.id, workspaceName);
      await this.touch(tx, workspaceId, [settlement.fromId, settlement.toId]);
      return toSettlementView(settlement);
    });
  }

  async list(actor: AuthUser, workspaceId: string, query: ListSettlementsQueryDto): Promise<CursorPage<SettlementView>> {
    await assertWalletRole(actor, workspaceId);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");

    const rows = await this.settlementRepo.list(workspaceId, {
      status: query.status,
      involving: query.mine ? actor.id : undefined,
      cursor,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return {
      data: page.map(toSettlementView),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      hasMore,
      limit: query.limit,
    };
  }

  /** Xác nhận: CAS PENDING→CONFIRMED (lần bấm thứ hai → `WALLET_007`, IR-34) rồi kiểm lại hạn mức với số dư HIỆN TẠI. */
  async confirm(actor: AuthUser, settlementId: string): Promise<SettlementView> {
    const s = await this.loadFor(actor, settlementId, "recipient");
    const workspaceName = await this.directory.workspaceName(s.workspaceId);

    return withTransaction(async (tx) => {
      await this.transition(tx, s.id, { to: "CONFIRMED", at: new Date() });
      const balances = await this.balancesOf(s.workspaceId, [s.fromId, s.toId], tx);
      if (s.amount > Math.max(0, -balances.get(s.fromId)!) || s.amount > Math.max(0, balances.get(s.toId)!)) {
        throw walletError(ErrorCode.WALLET_005, 400);
      }

      const result = await this.projection.apply(tx, s.workspaceId, [
        { userId: s.fromId, balance: s.amount, owedTotal: 0 },
        { userId: s.toId, balance: -s.amount, owedTotal: 0 },
      ]);
      const allocations = (result.shareChanges.get(s.fromId) ?? [])
        .filter((c) => c.after > c.before)
        .map((c) => ({ shareId: c.shareId, amount: c.after - c.before }));
      await this.settlementRepo.setAllocations(s.id, allocations, tx);

      await this.notifyParty(tx, "wallet.settlement-confirmed", s, s.fromId, actor.id, workspaceName);
      await emitWalletUpdated(tx, s.workspaceId, result, "SETTLEMENT");
      return toSettlementView((await this.settlementRepo.findById(s.id, tx)) as Settlement);
    });
  }

  async reject(actor: AuthUser, settlementId: string, reason: string): Promise<SettlementView> {
    const s = await this.loadFor(actor, settlementId, "recipient");
    const workspaceName = await this.directory.workspaceName(s.workspaceId);
    return withTransaction(async (tx) => {
      await this.transition(tx, s.id, { to: "REJECTED", at: new Date(), reason });
      await this.notifyParty(tx, "wallet.settlement-rejected", s, s.fromId, actor.id, workspaceName);
      await this.touch(tx, s.workspaceId, [s.fromId, s.toId]);
      return toSettlementView((await this.settlementRepo.findById(s.id, tx)) as Settlement);
    });
  }

  async cancel(actor: AuthUser, settlementId: string): Promise<SettlementView> {
    const s = await this.loadFor(actor, settlementId, "sender");
    return withTransaction(async (tx) => {
      await this.transition(tx, s.id, { to: "CANCELLED", at: new Date() });
      await this.touch(tx, s.workspaceId, [s.fromId, s.toId]);
      return toSettlementView((await this.settlementRepo.findById(s.id, tx)) as Settlement);
    });
  }

  private async transition(tx: Tx, id: string, change: SettlementTransition): Promise<void> {
    if ((await this.settlementRepo.transitionFromPending(id, change, tx)) === 0) throw walletError(ErrorCode.WALLET_007, 409);
  }

  /** Số dư 0 cho người chưa có bản ghi. */
  private async balancesOf(workspaceId: string, userIds: string[], tx: Tx): Promise<Map<string, number>> {
    const rows = await this.walletRepo.getBalances(workspaceId, userIds, tx);
    return new Map(userIds.map((id) => [id, rows.find((r) => r.userId === id)?.balance ?? 0]));
  }

  /** settlement chỉ đổi danh sách/không đổi số dư: vẫn tăng `walletVersion` để client của cả hai bên refetch. */
  private async touch(tx: Tx, workspaceId: string, userIds: string[]): Promise<void> {
    const walletVersion = await this.walletRepo.bumpWalletVersion(workspaceId, tx);
    await emitWalletUpdated(tx, workspaceId, { walletVersion, changedUserIds: userIds }, "SETTLEMENT");
  }

  private async notifyParty(
    tx: Tx,
    type: string,
    s: Settlement,
    recipientId: string,
    actorId: string,
    workspaceName: string | null
  ): Promise<void> {
    await notify(tx, {
      type,
      actorId,
      scope: { type: "WORKSPACE", id: s.workspaceId },
      workspaceId: s.workspaceId,
      source: { type: "wallet-settlement", id: `${s.id}-${type}` },
      refs: { workspaceId: s.workspaceId, settlementId: s.id, workspaceName: workspaceName ?? undefined },
      recipients: [{ userId: recipientId }],
      dedupeKey: `${type}:${s.id}`,
    });
  }

  private async loadFor(actor: AuthUser, settlementId: string, who: "recipient" | "sender"): Promise<Settlement> {
    const s = await this.settlementRepo.findById(settlementId);
    if (!s) throw new ScopeNotFoundError();
    await assertWalletRole(actor, s.workspaceId);
    await assertWorkspaceWritable(this.directory, s.workspaceId);
    const allowed = who === "recipient" ? s.toId === actor.id : s.fromId === actor.id;
    if (!allowed) throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    return s;
  }

  /** Dùng mã người gửi đã nhận ở `payment-info` nếu còn trống; đụng mã (hiếm) thì sinh mã mới. */
  private async uniqueCode(preferred?: string): Promise<string> {
    let code = preferred ?? generateSettlementCode();
    for (let i = 0; i < CODE_ATTEMPTS; i += 1) {
      if (!(await this.settlementRepo.findByCode(code))) return code;
      code = generateSettlementCode();
    }
    return code;
  }
}
