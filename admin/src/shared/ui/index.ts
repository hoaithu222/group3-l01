/**
 * Kit2 — điểm nhập DUY NHẤT cho mọi component UI.
 *
 * Luôn `import { X } from '@/shared/ui'`, KHÔNG import sâu vào từng nhóm.
 * Component chia theo CHỨC NĂNG, mỗi nhóm giữ barrel riêng:
 *
 *   primitives/    Nguyên tố hiển thị — không state, không hành vi
 *   feedback/      Phản hồi trạng thái — tải, rỗng, cảnh báo, tiến độ
 *   actions/       Điều khiển hành động — nút, menu, chuyển chế độ
 *   inputs/        Ô nhập liệu cơ bản
 *   selects/       Chọn từ danh sách
 *   pickers/       Chọn ngày / giờ
 *   overlays/      Lớp nổi — popover, tooltip, hộp thoại, thông báo
 *   navigation/    Điều hướng — tab, bước, phân trang
 *   data-display/  Trình bày dữ liệu — bảng, cây
 *   surfaces/      Mặt nền — panel, khung HUD, thẻ số liệu
 *   media/         Ảnh và tệp
 *   layout/        Bố cục khung màn hình
 *   form/          Hệ form react-hook-form + Zod (field, layout, pattern, hook)
 *   icons/         Registry icon tự sinh — chạy `npm run generate:icons`
 */

export * from './primitives';
export * from './feedback';
export * from './actions';
export * from './inputs';
export * from './selects';
export * from './pickers';
export * from './overlays';
export * from './navigation';
export * from './data-display';
export * from './surfaces';
export * from './media';
export * from './layout';

export { default as GemIcon } from './icons/GemIcon';
export type { GemColor, GemIconProps, GemSize } from './icons/GemIcon';

/**
 * ⛔ `SystemIcon` (giá trị) CỐ Ý không ở đây — đưa vào là mọi trang phải nạp cả
 * registry 377 icon. Import trực tiếp: `from '@/shared/ui/icons/Icons'`.
 *
 * `SystemIconName` thì KHÁC: nó là KIỂU, bị xoá sạch lúc biên dịch nên không
 * thêm một byte nào vào gói. Trước đây nó cũng phải import sâu, khiến 6 file chỉ
 * cần một cái tên kiểu cũng phải phá luật "chỉ import qua barrel gốc".
 */
export type { SystemIconName } from './icons';
export type { FieldSize } from './form';
export { PasswordStrength } from './form';
export {
  Form,
  FormItem,
  FormActions,
  useFormMeta,
  useZodForm,
  useFormField,
  useServerErrors,
  useAsyncValidation,
  useFormDraft,
  useDirtyGuard,
  useModalDateDefaults,
  TextField,
  TimeField,
  EmailField,
  PhoneField,
  IPAddressField,
  PasswordField,
  TextareaField,
  NumberField,
  MaskedField,
  SelectField,
  MultiSelectField,
  CheckboxField,
  ToggleField,
  RadioGroupField,
  DateField,
  DateRangeField,
  AsyncSelectField,
  CascadeSelectField,
  FileField,
  ColorPickerField,
  FormSection,
  FormGrid,
  FormRow,
  FieldArray,
  NestedFieldArray,
  DictionaryField,
  FormTabs,
  SortableFieldArray,
  ConditionalField,
  DynamicSchemaField,
  FormStepper,
} from './form';

// Kiểu Props của hệ form — bọc lại field/section mà vẫn giữ kiểu.
export type {
  TextFieldProps,
  EmailFieldProps,
  PhoneFieldProps,
  IPAddressFieldProps,
  PasswordFieldProps,
  TextareaFieldProps,
  NumberFieldProps,
  MaskedFieldProps,
  SelectFieldProps,
  MultiSelectFieldProps,
  CheckboxFieldProps,
  ToggleFieldProps,
  RadioGroupFieldProps,
  DateFieldProps,
  TimeFieldProps,
  DateRangeFieldProps,
  AsyncSelectFieldProps,
  CascadeSelectFieldProps,
  FileFieldProps,
  ColorPickerFieldProps,
  FormProps,
  FormItemProps,
  FormActionsProps,
  PasswordStrengthProps,
  FormSectionProps,
  FormGridProps,
  FormRowProps,
  DictionaryFieldProps,
  FormTabsProps,
  ConditionalFieldProps,
  DynamicSchemaFieldProps,
  FormStepperProps,
} from './form';
