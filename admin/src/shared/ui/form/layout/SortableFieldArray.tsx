import { createContext, useContext } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useFieldArray,
  type Control,
  type FieldValues,
  type FieldArrayPath,
} from 'react-hook-form';
import type { FieldArrayWithId, UseFieldArrayReturn } from 'react-hook-form';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

// ── Drag handle context ───────────────────────────────────────────────────────

interface DragHandleCtx {
  attributes: DraggableAttributes | Record<string, never>;
  listeners: SyntheticListenerMap | undefined;
}

const DragHandleContext = createContext<DragHandleCtx>({ attributes: {}, listeners: undefined });

// ── Sortable item ────────────────────────────────────────────────────────────

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <DragHandleContext.Provider value={{ attributes, listeners }}>
      <div
        ref={setNodeRef}
        className={cn('relative', isDragging && 'opacity-50 z-10')}
        style={{ transform: CSS.Transform.toString(transform), transition }}
      >
        {children}
      </div>
    </DragHandleContext.Provider>
  );
}

/** Drag handle — place inside SortableFieldArray.Item children. */
function DragHandle({ className }: { className?: string }) {
  const { attributes, listeners } = useContext(DragHandleContext);
  return (
    <button
      type="button"
      {...(attributes as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      {...(listeners as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      aria-label="Kéo để sắp xếp"
      className={cn(
        'cursor-grab active:cursor-grabbing text-fg-4 hover:text-fg-1 transition-colors',
        className,
      )}
    >
      <SystemIcon name="grip-dots-vertical-outline" size={16} />
    </button>
  );
}

// ── Render props ──────────────────────────────────────────────────────────────

interface SortableRenderProps<T extends FieldValues, N extends FieldArrayPath<T>> {
  fields: FieldArrayWithId<T, N>[];
  append: UseFieldArrayReturn<T, N>['append'];
  remove: UseFieldArrayReturn<T, N>['remove'];
  move: UseFieldArrayReturn<T, N>['move'];
}

export interface SortableFieldArrayProps<T extends FieldValues, N extends FieldArrayPath<T>> {
  name: N;
  /**
   * Bỏ trống thì lấy từ `FormProvider` bao ngoài — giống mọi field khác của
   * kit, không phải luồn `form` xuống tay. Chỉ truyền khi mảng nằm NGOÀI cây
   * provider (hiếm).
   */
  control?: Control<T>;
  children: (props: SortableRenderProps<T, N>) => React.ReactNode;
  className?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

function SortableFieldArrayBase<T extends FieldValues, N extends FieldArrayPath<T>>({
  name,
  control,
  children,
  className,
}: SortableFieldArrayProps<T, N>) {
  const { fields, append, remove, move } = useFieldArray<T, N>({ name, control });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        // arrayMove for preview; move keeps RHF in sync
        move(oldIndex, newIndex);
      }
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        <div className={cn('flex flex-col gap-2', className)}>
          {children({ fields, append, remove, move })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── Compound export ───────────────────────────────────────────────────────────

const SortableFieldArray = Object.assign(SortableFieldArrayBase, {
  Item: SortableItem,
  DragHandle,
});

export default SortableFieldArray;
