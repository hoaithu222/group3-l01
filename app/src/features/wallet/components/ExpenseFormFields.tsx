import { Controller, type UseFormReturn } from 'react-hook-form';
import { Text, View } from 'react-native';

import { DatePicker } from '@/shared/ui/date-picker';
import { FormInput } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';

import type { WalletMember } from '../api';
import { WALLET_LIMITS } from '../constants/wallet.constants';
import type { SplitPreview } from '../domain/split-preview';
import type { useReceiptUpload } from '../hooks/useReceiptUpload';
import type { ExpenseFormInput, ExpenseFormValues } from '../schemas/wallet-forms.schemas';
import { ExpenseCategoryChips } from './ExpenseCategoryChips';
import { ExpensePayerSelect } from './ExpensePayerSelect';
import { MoneyInput } from './MoneyInput';
import { ReceiptPicker } from './ReceiptPicker';
import { SplitEditor } from './SplitEditor';

export type ExpenseFormMode = 'adjust' | 'create' | 'edit';

export interface ExpenseFormFieldsProps {
  /** `WALLET_001`: id người không thuộc nhóm — đánh dấu dòng tương ứng ở `SplitEditor`. */
  invalidUserIds?: readonly string[];
  members: readonly WalletMember[];
  /** `adjust` chỉ cho sửa số tiền + mô tả + cách chia: người trả/ngày/danh mục/ảnh của khoản GỐC không đổi (be.md `createAdjustmentSchema`). */
  mode: ExpenseFormMode;
  preview: SplitPreview;
  receipt: ReturnType<typeof useReceiptUpload>;
  disabled?: boolean;
  form: UseFormReturn<ExpenseFormInput, unknown, ExpenseFormValues>;
}

/**
 * Các ô của form khoản chi — dùng chung cho THÊM · SỬA · ĐIỀU CHỈNH để ba luồng không
 * lệch nhau ở cách nhập tiền và cách chia (cùng một chỗ tính ra số nợ).
 *
 * ✅ Thứ tự = thứ tự người dùng điền: "Thông tin khoản chi" (số tiền · mô tả · danh mục · người trả · ngày) →
 * "Chia cho ai?" → ảnh hoá đơn. Ảnh hoá đơn là ô TUỲ CHỌN nên đứng CUỐI (trước đây chen giữa ngày chi và phần chia:
 * người dùng phải lướt qua một khối tuỳ chọn cao ~120dp mới tới phần bắt buộc). Hai khối bắt buộc có tiêu đề nhóm
 * để form dài vẫn quét được; nút Lưu dính đáy do `ExpenseSaveBar` lo.
 */
export function ExpenseFormFields({
  disabled,
  form,
  invalidUserIds,
  members,
  mode,
  preview,
  receipt,
}: ExpenseFormFieldsProps) {
  const { control } = form;
  const original = mode !== 'adjust';

  return (
    <View className="gap-xl">
      <Section title="Thông tin khoản chi">
        <View className="gap-md">
          <Controller
            control={control}
            name="amount"
            render={({ field, fieldState }) => (
              <MoneyInput
                disabled={disabled}
                label="Số tiền"
                message={fieldState.error?.message}
                messageTone="error"
                required
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <FormInput<ExpenseFormInput>
            control={control}
            disabled={disabled}
            label="Mô tả"
            maxLength={WALLET_LIMITS.descriptionMax}
            name="description"
            placeholder="Ví dụ: Ăn trưa sau buổi họp"
            required
            returnKeyType="done"
          />

          {original ? (
            <>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <ExpenseCategoryChips
                    disabled={disabled}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="paidBy"
                render={({ field, fieldState }) => (
                  <ExpensePayerSelect
                    disabled={disabled}
                    members={members}
                    message={fieldState.error?.message}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="occurredAt"
                render={({ field }) => (
                  <DatePicker
                    disabled={disabled}
                    label="Ngày chi"
                    maxDate={new Date()}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </>
          ) : (
            <Text className="text-body-md text-fg-2">
              Khoản điều chỉnh ghi lại số ĐÚNG mới của cả khoản chi — hệ thống tự tính phần chênh
              lệch với bản đang hiệu lực.
            </Text>
          )}
        </View>
      </Section>

      <Section title="Chia cho ai?">
        <Controller
          control={control}
          name="split"
          render={({ field, fieldState }) => (
            <View className="gap-xs">
              <SplitEditor
                amount={form.watch('amount')}
                disabled={disabled}
                draft={field.value}
                invalidUserIds={invalidUserIds}
                members={members}
                paidBy={form.watch('paidBy')}
                preview={preview}
                onChange={field.onChange}
              />
              {fieldState.error?.message && preview.valid ? (
                <Text className="text-caption-lg text-error">{fieldState.error.message}</Text>
              ) : null}
            </View>
          )}
        />
      </Section>

      {original ? <ReceiptPicker disabled={disabled} receipt={receipt} title="Ảnh hoá đơn" /> : null}
    </View>
  );
}
