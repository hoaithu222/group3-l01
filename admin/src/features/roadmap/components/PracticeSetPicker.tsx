import { useCallback, useRef, useState } from 'react';

import { Badge, Button, Input, Popover } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useImeSafeSearchInput } from '@/shared/hooks';
import { debounce } from '@/shared/utils/browser/debounce.utils';

import { roadmapService } from '../service/roadmap.service';
import type { StudySetOption } from '../types/roadmap.types';

export interface PracticeSetPickerProps {
  /** `practiceSetIds` hiện tại — KHÔNG bind trực tiếp qua `name` (RHF field đơn) vì cần hiển thị tiêu đề
   * đã chọn, không chỉ id; `LessonEditorPage` nối với form qua `useWatch`/`setValue`. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Tóm tắt id → tiêu đề đã biết khi tải trang (`AdminLessonDetail.practiceSets`, xem giả định ở `roadmap.types.ts`). */
  initialOptions?: StudySetOption[];
  max?: number;
  disabled?: boolean;
}

const DEFAULT_MAX = 10;

/**
 * Chọn StudySet PUBLIC cho tab "Luyện tập" (admin.md §2 LessonEditorPage, README §3 "chủ Nội dung mẫu").
 * kit2 KHÔNG có select nhiều lựa chọn kèm tìm-kiếm-từ-server sẵn (`AsyncSelectField` là single-select,
 * `MultiSelectField` chỉ nhận option TĨNH) nên tự ghép `Popover` + `Input` + `Badge` — mượn ĐÚNG cách nạp
 * dữ liệu của `AsyncSelectField` (debounce qua ref, gọi từ handler mở popover/gõ tìm — KHÔNG qua
 * `useEffect`, tránh `react-hooks/set-state-in-effect`), chỉ khác hành vi CHỌN THÊM (append) thay vì THAY
 * THẾ 1 giá trị. Tìm qua `roadmapService.searchPublicStudySets` (`GET /study-sets?scope=public`) — xem
 * giả định endpoint ở `roadmap.types.ts`/báo cáo bàn giao.
 */
export default function PracticeSetPicker({
  value,
  onChange,
  initialOptions,
  max = DEFAULT_MAX,
  disabled,
}: PracticeSetPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<StudySetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [known, setKnown] = useState<Map<string, string>>(
    () => new Map((initialOptions ?? []).map((o) => [o.id, o.title])),
  );

  const runSearch = useCallback((q: string) => {
    setLoading(true);
    roadmapService
      .searchPublicStudySets(q)
      .then((res) => {
        setOptions(res.data);
        setKnown((prev) => {
          const next = new Map(prev);
          res.data.forEach((o) => next.set(o.id, o.title));
          return next;
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const debouncedSearchRef = useRef(debounce(runSearch, 300));

  const handleSearchChange = useCallback((next: string) => {
    setSearch(next);
    debouncedSearchRef.current(next);
  }, []);
  const { inputProps } = useImeSafeSearchInput(search, handleSearchChange);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) runSearch(search);
    },
    [runSearch, search],
  );

  const add = useCallback(
    (opt: StudySetOption) => {
      if (value.includes(opt.id) || value.length >= max) return;
      setKnown((prev) => new Map(prev).set(opt.id, opt.title));
      onChange([...value, opt.id]);
    },
    [value, onChange, max],
  );

  const removeId = useCallback((id: string) => onChange(value.filter((v) => v !== id)), [value, onChange]);

  const remainingOptions = options.filter((o) => !value.includes(o.id));
  const atMax = value.length >= max;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) => (
          <Badge
            key={id}
            color="primary"
            variant="tinted"
            onRemove={disabled ? undefined : () => removeId(id)}
          >
            {known.get(id) ?? id}
          </Badge>
        ))}
        {value.length === 0 && (
          <span className="text-body-14 text-fg-4">Chưa gắn bộ luyện tập nào.</span>
        )}
      </div>

      {!disabled && (
        <Popover
          align="start"
          content={
            <div className="w-80 p-2">
              <Input
                {...inputProps}
                autoFocus
                placeholder="Tìm StudySet công khai…"
                size="sm"
                startIcon={<SystemIcon name="magnifying-glass-outline" size={14} />}
              />
              <div className="mt-2 flex max-h-60 flex-col gap-0.5 overflow-auto">
                {loading ? (
                  <p className="px-2 py-2 text-body-14 text-fg-4">Đang tìm…</p>
                ) : remainingOptions.length === 0 ? (
                  <p className="px-2 py-2 text-body-14 text-fg-4">Không có kết quả</p>
                ) : (
                  remainingOptions.map((opt) => (
                    <Button
                      key={opt.id}
                      className="justify-between"
                      fullWidth
                      size="sm"
                      variant="ghost"
                      onClick={() => add(opt)}
                    >
                      <span className="truncate">{opt.title}</span>
                      <span className="shrink-0 text-caption-12 text-fg-4">{opt.itemCount} mục</span>
                    </Button>
                  ))
                )}
              </div>
            </div>
          }
          open={open}
          side="bottom"
          sideOffset={4}
          variant="glass"
          onOpenChange={handleOpenChange}
        >
          <Button
            disabled={atMax}
            size="sm"
            startIcon={<SystemIcon name="plus-outline" size={14} />}
            variant="stroke"
          >
            {atMax ? `Đã đạt tối đa ${max} bộ` : 'Thêm bộ luyện tập'}
          </Button>
        </Popover>
      )}
    </div>
  );
}
