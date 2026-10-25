// ── Core ──────────────────────────────────────────────────────────────────────
export { default as Form } from './Form';
export type { FormProps } from './Form';
export { default as FormItem } from './FormItem';
export type { FormItemProps, ErrorColor } from './FormItem';
export { default as FormActions } from './FormActions';
export type { FormActionsProps } from './FormActions';
export { default as PasswordStrength } from './PasswordStrength';
export type { PasswordStrengthProps } from './PasswordStrength';
export type { PasswordCondition, PasswordStrengthLevel } from './password-strength.helpers';
export { DEFAULT_PASSWORD_CONDITIONS, getPasswordLevel } from './password-strength.helpers';
export { useFormMeta } from './form.context';
export type {
  FormMeta,
  FormBaseProps,
  AutoSaveOptions,
  DirtyGuardOptions,
  FieldSize,
} from './form.types';
export type { FieldA11y, FieldItemA11y, FieldInputA11y, FieldTriggerA11y } from './hooks';

// ── Hooks ────────────────────────────────────────────────────────────────────
export {
  useZodForm,
  useFormField,
  useFieldA11y,
  useServerErrors,
  useAsyncValidation,
  useFormDraft,
  useDirtyGuard,
  useModalDateDefaults,
} from './hooks';

// ── Fields ───────────────────────────────────────────────────────────────────
export {
  TextField,
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
  TimeField,
  DateRangeField,
  AsyncSelectField,
  CascadeSelectField,
  FileField,
  ColorPickerField,
} from './fields';

export type {
  MaskType,
  RadioOption,
  DateRangeValue,
  AsyncOption,
  CascadeLevel,
  UploadedFile,
} from './fields';

// ── Layout ───────────────────────────────────────────────────────────────────
export {
  FormSection,
  FormGrid,
  FormRow,
  FieldArray,
  NestedFieldArray,
  DictionaryField,
  FormTabs,
  SortableFieldArray,
} from './layout';

// ── Patterns ─────────────────────────────────────────────────────────────────
export { ConditionalField, DynamicSchemaField, FormStepper } from './patterns';

export type { FormStep } from './patterns';

// Kiểu Props của field — để bên ngoài bọc lại mà vẫn giữ kiểu.
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
} from './fields';

// Kiểu Props của lớp bố cục form.
export type {
  FormSectionProps,
  FormGridProps,
  FormRowProps,
  DictionaryFieldProps,
  FormTabsProps,
} from './layout';

// Kiểu Props của các mẫu form nâng cao.
export type { ConditionalFieldProps, DynamicSchemaFieldProps, FormStepperProps } from './patterns';
