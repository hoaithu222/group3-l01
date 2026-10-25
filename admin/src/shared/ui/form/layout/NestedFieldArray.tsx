/**
 * NestedFieldArray — alias for FieldArray with a scoped name path.
 *
 * There is no functional difference from FieldArray; this export exists purely
 * for readability when using array-inside-array patterns:
 *
 *   <FieldArray name="chapters" control={form.control}>
 *     {({ fields: chapters }) => chapters.map((c, ci) => (
 *       <NestedFieldArray name={`chapters.${ci}.lessons`} control={form.control}>
 *         {({ fields: lessons }) => ...}
 *       </NestedFieldArray>
 *     ))}
 *   </FieldArray>
 */
export { default } from './FieldArray';

/**
 * Cùng hợp đồng với `FieldArray` — đây chỉ là bí danh để chỗ dùng đọc rõ ý.
 * Xuất kiểu ra để bọc lại được, giống mọi component công khai khác.
 */
export type { FieldArrayProps as NestedFieldArrayProps } from './FieldArray';
