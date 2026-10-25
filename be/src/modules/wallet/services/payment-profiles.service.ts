import { LIMITS } from "../../../core/constants/limits";
import { ScopeNotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { decryptAesGcm, encryptAesGcm } from "../../../core/utils/crypto";
import type { AuthUser } from "../../../core/types/express";
import type { AuditService } from "../../audit-log/audit-log.service";
import { bankNameOf, normalizeAccountName } from "../domain/vn-banks";
import { generateSettlementCode } from "../domain/vietqr-reference";
import type { PaymentInfoView, PaymentProfileView } from "../entities/wallet.interface";
import type { PaymentProfileDto } from "../dtos";
import type { IPaymentProfileRepository } from "../repositories/payment-profile.repository.interface";
import type { IWalletRepository } from "../repositories/wallet.repository.interface";
import { assertWalletRole } from "./wallet-access";
import { walletError } from "./expense-helpers";
import { toPaymentProfileView } from "./wallet-presenter";

type AuditRecorder = Pick<AuditService, "record">;

/** Tài khoản nhận tiền: số TK mã hoá AES-GCM, danh sách chỉ có 4 số cuối, số đầy đủ chỉ tới người ĐANG NỢ chủ TK. */
export class PaymentProfilesService {
  constructor(
    private readonly profileRepo: IPaymentProfileRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly audit: AuditRecorder
  ) {}

  async list(userId: string): Promise<PaymentProfileView[]> {
    return (await this.profileRepo.listByUser(userId)).map(toPaymentProfileView);
  }

  async create(userId: string, dto: PaymentProfileDto): Promise<PaymentProfileView> {
    if ((await this.profileRepo.count(userId)) >= LIMITS.wallet.paymentProfilesMax) throw walletError(ErrorCode.WALLET_009, 409);
    const isFirst = (await this.profileRepo.count(userId)) === 0;
    const created = await this.profileRepo.create({
      userId,
      bankBin: dto.bankBin,
      accountNumberEnc: encryptAesGcm(dto.accountNumber),
      accountLast4: dto.accountNumber.slice(-4),
      accountName: normalizeAccountName(dto.accountName),
      isDefault: false,
    });
    if (isFirst || dto.isDefault) await this.profileRepo.setDefault(userId, created.id);
    const fresh = await this.profileRepo.findById(userId, created.id);
    return toPaymentProfileView(fresh ?? created);
  }

  async setDefault(userId: string, id: string): Promise<PaymentProfileView> {
    if (!(await this.profileRepo.findById(userId, id))) throw new ScopeNotFoundError();
    await this.profileRepo.setDefault(userId, id);
    return toPaymentProfileView((await this.profileRepo.findById(userId, id)) as NonNullable<Awaited<ReturnType<IPaymentProfileRepository["findById"]>>>);
  }

  /** Xoá hồ sơ mặc định thì hồ sơ mới nhất còn lại lên mặc định (luôn có 1 mặc định khi còn hồ sơ). */
  async remove(userId: string, id: string): Promise<void> {
    const target = await this.profileRepo.findById(userId, id);
    if (!target) throw new ScopeNotFoundError();
    await this.profileRepo.delete(userId, id);
    if (target.isDefault) {
      const next = await this.profileRepo.findDefault(userId);
      if (next) await this.profileRepo.setDefault(userId, next.id);
    }
  }

  /**
   * IR-37: chỉ người đang nợ `payeeId` (số dư người gọi < 0 và số dư payee > 0) mới thấy số TK; ngược lại 404
   * (không phân biệt "không có TK" với "không đủ điều kiện" để không lộ ai có hồ sơ). Audit KHÔNG ghi số TK.
   */
  async getPayeeInfo(actor: AuthUser, workspaceId: string, payeeId: string): Promise<PaymentInfoView> {
    await assertWalletRole(actor, workspaceId);
    if (payeeId === actor.id) throw new ScopeNotFoundError();

    const rows = await this.walletRepo.getBalances(workspaceId, [actor.id, payeeId]);
    const mine = rows.find((r) => r.userId === actor.id)?.balance ?? 0;
    const theirs = rows.find((r) => r.userId === payeeId)?.balance ?? 0;
    if (mine >= 0 || theirs <= 0) throw new ScopeNotFoundError();

    const profile = await this.profileRepo.findDefault(payeeId);
    if (!profile) throw new ScopeNotFoundError();

    await this.audit.record({
      actorId: actor.id,
      action: "wallet.payment-info-view",
      targetType: "User",
      targetId: payeeId,
      workspaceId,
      metadata: { viewerId: actor.id, payeeId, workspaceId },
    });

    return {
      bankBin: profile.bankBin,
      bankName: bankNameOf(profile.bankBin),
      accountNumber: decryptAesGcm(profile.accountNumberEnc),
      accountName: profile.accountName,
      suggestedAmount: Math.min(-mine, theirs),
      reference: generateSettlementCode(),
    };
  }
}
