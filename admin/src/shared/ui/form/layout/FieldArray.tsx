import {
  useFieldArray,
  type Control,
  type FieldValues,
  type FieldArrayPath,
} from 'react-hook-form';
import { type FieldArrayWithId, type UseFieldArrayReturn } from 'react-hook-form';

interface FieldArrayRenderProps<T extends FieldValues, N extends FieldArrayPath<T>> {
  fields: FieldArrayWithId<T, N>[];
  append: UseFieldArrayReturn<T, N>['append'];
  prepend: UseFieldArrayReturn<T, N>['prepend'];
  remove: UseFieldArrayReturn<T, N>['remove'];
  move: UseFieldArrayReturn<T, N>['move'];
  insert: UseFieldArrayReturn<T, N>['insert'];
  swap: UseFieldArrayReturn<T, N>['swap'];
  update: UseFieldArrayReturn<T, N>['update'];
}

export interface FieldArrayProps<T extends FieldValues, N extends FieldArrayPath<T>> {
  name: N;
  /**
   * Bỏ trống thì lấy từ `FormProvider` bao ngoài — giống mọi field khác của
   * kit, không phải luồn `form` xuống tay. Chỉ truyền khi mảng nằm NGOÀI cây
   * provider (hiếm).
   */
  control?: Control<T>;
  children: (props: FieldArrayRenderProps<T, N>) => React.ReactNode;
  className?: string;
}

/**
 * Render-prop wrapper around `useFieldArray`.
 * Supports basic, nested, and dictionary patterns.
 *
 * Usage:
 *   <FieldArray name="contacts" control={form.control}>
 *     {({ fields, append, remove }) => ...}
 *   </FieldArray>
 */
function FieldArray<T extends FieldValues, N extends FieldArrayPath<T>>({
  name,
  control,
  children,
  className,
}: FieldArrayProps<T, N>) {
  const methods = useFieldArray<T, N>({ name, control });

  return (
    <div className={className}>
      {children({
        fields: methods.fields,
        append: methods.append,
        prepend: methods.prepend,
        remove: methods.remove,
        move: methods.move,
        insert: methods.insert,
        swap: methods.swap,
        update: methods.update,
      })}
    </div>
  );
}

export default FieldArray;
