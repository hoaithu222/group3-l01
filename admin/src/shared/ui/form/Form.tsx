import { type FieldValues, FormProvider, type UseFormReturn } from 'react-hook-form';
import { FormMetaProvider } from './form.context';
import { useFormDraft } from './hooks/useFormDraft';
import FormDirtyGuard from './FormDirtyGuard';
import FormItem from './FormItem';
import FormActions from './FormActions';
import { toSafeLog } from '@/shared/utils/error-log.utils';
import { cn } from '@/shared/utils/style/cn';
import type { AutoSaveOptions, DirtyGuardOptions } from './form.types';

// ── Sub-components ────────────────────────────────────────────────────────────

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-caption-12 text-error" role="alert">
      {message}
    </p>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface FormProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  onSubmit: (data: T) => void | Promise<void>;
  children: React.ReactNode;
  readOnly?: boolean;
  autoSave?: boolean | AutoSaveOptions;
  dirtyGuard?: boolean | DirtyGuardOptions;
  className?: string;
}

// ── Internal wrapper (holds all hooks without conditional violations) ──────────

interface FormInnerProps<T extends FieldValues> extends FormProps<T> {
  autoSaveKey: string;
  dirtyEnabled: boolean;
  dirtyMessage: string | undefined;
}

function FormInner<T extends FieldValues>({
  form,
  onSubmit,
  children,
  readOnly = false,
  autoSave,
  autoSaveKey,
  dirtyEnabled,
  dirtyMessage,
  className,
}: FormInnerProps<T>) {
  useFormDraft({ key: autoSaveKey, form, enabled: Boolean(autoSave) });

  /**
   * Nuốt lỗi mà handler ném ra — nhưng GHI LẠI, không giấu.
   *
   * `handleSubmit` của react-hook-form ném lại lỗi từ callback, còn thuộc tính
   * `onSubmit` của DOM lại bỏ qua promise trả về, nên lỗi thành
   * `Uncaught (in promise)`. Mà ném lỗi ở đây là chuyện BÌNH THƯỜNG:
   * `mutateAsync` reject khi máy chủ từ chối, và `docs/rules/form-validation.md`
   * §4 còn DẠY ném lỗi để chặn form đóng khi trùng mã.
   *
   * Trạng thái lỗi vốn đã hiện cho người dùng qua `mutation.isError`, nên ở
   * đây chỉ cần chặn không cho nó nổi lên thành lỗi toàn cục.
   */
  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (err) {
      // `toSafeLog`: lỗi axios mang theo `config.data` (mật khẩu) và `Authorization` (token).
      console.error('[Form] onSubmit ném lỗi:', toSafeLog(err));
    }
  });

  return (
    <FormProvider {...form}>
      <FormMetaProvider value={{ readOnly, autoSave: Boolean(autoSave) }}>
        <form className={cn('flex flex-col gap-4', className)} noValidate onSubmit={handleSubmit}>
          {children}
        </form>

        {/* Mount có điều kiện — xem `FormDirtyGuard` (blocker của router chỉ đăng ký khi guard bật). */}
        {dirtyEnabled && <FormDirtyGuard form={form} message={dirtyMessage} />}
      </FormMetaProvider>
    </FormProvider>
  );
}

// ── Public Form component ────────────────────────────────────────────────────

function FormBase<T extends FieldValues>({ autoSave, dirtyGuard, ...rest }: FormProps<T>) {
  const autoSaveKey = typeof autoSave === 'object' ? autoSave.key : autoSave ? 'form-default' : '';
  const dirtyEnabled = Boolean(dirtyGuard);
  const dirtyMessage = typeof dirtyGuard === 'object' ? dirtyGuard.message : undefined;

  return (
    <FormInner
      {...rest}
      autoSave={autoSave}
      autoSaveKey={autoSaveKey}
      dirtyEnabled={dirtyEnabled}
      dirtyMessage={dirtyMessage}
    />
  );
}

// ── Compound components ──────────────────────────────────────────────────────

const Form = Object.assign(FormBase, {
  Item: FormItem,
  Actions: FormActions,
  Error: FormError,
});

export default Form;
