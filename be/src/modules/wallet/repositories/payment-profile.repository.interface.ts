import type { PaymentProfile } from "../entities/wallet.interface";

export interface NewPaymentProfile {
  userId: string;
  bankBin: string;
  accountNumberEnc: string;
  accountLast4: string;
  accountName: string;
  isDefault: boolean;
}

/** Hồ sơ nhận tiền — `accountNumberEnc` là base64(iv|tag|cipher), KHÔNG bao giờ log. */
export interface IPaymentProfileRepository {
  listByUser(userId: string): Promise<PaymentProfile[]>;
  findById(userId: string, id: string): Promise<PaymentProfile | null>;
  findDefault(userId: string): Promise<PaymentProfile | null>;
  count(userId: string): Promise<number>;
  create(data: NewPaymentProfile): Promise<PaymentProfile>;
  /** Đặt đúng 1 hồ sơ mặc định, bỏ mặc định các hồ sơ còn lại của user. */
  setDefault(userId: string, id: string): Promise<void>;
  delete(userId: string, id: string): Promise<boolean>;
}
