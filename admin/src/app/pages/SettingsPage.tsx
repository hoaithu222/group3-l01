import { memo, useCallback, useId } from 'react';

import { useDisplayStore, useThemeStore } from '@/app/store';
import { UI_SCALE_VALUES } from '@/app/store/slices/display/constants';
import type { UiScale } from '@/app/store/slices/display/types';
import { BoxPanel, PageShell, SegmentToggle, Text, Toggle } from '@/shared/ui';
import { PageHeader } from '@/shared/widgets/header';

const THEME_OPTIONS = [
  { key: 'light', label: 'Sáng' },
  { key: 'dark', label: 'Tối' },
];

const SCALE_OPTIONS = UI_SCALE_VALUES.map((v) => ({ key: String(v), label: `×${v}` }));

/**
 * Cài đặt hiển thị — đích của mục "Cài đặt" trong menu Header.
 *
 * Chỉ gồm thứ base thật sự có: theme và chế độ TV. Cài đặt riêng của dự án
 * (thông báo, ngôn ngữ, quyền riêng tư…) thêm vào đây khi có. Tiêu đề nằm trên
 * THANH HEADER (`<PageHeader>`), không chiếm dòng nào của vùng nội dung.
 */
const SettingsPage = memo(function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const mode = useDisplayStore((s) => s.mode);
  const uiScale = useDisplayStore((s) => s.uiScale);
  const setMode = useDisplayStore((s) => s.setMode);
  const setUiScale = useDisplayStore((s) => s.setUiScale);

  const ids = useId();
  const themeLabelId = `${ids}-theme`;
  const tvLabelId = `${ids}-tv`;
  const scaleLabelId = `${ids}-scale`;

  const handleTheme = useCallback((key: string) => setTheme(key as 'light' | 'dark'), [setTheme]);
  const handleTv = useCallback(
    (checked: boolean) => setMode(checked ? 'tv' : 'standard'),
    [setMode],
  );
  const handleScale = useCallback(
    (key: string) => setUiScale(Number(key) as UiScale),
    [setUiScale],
  );

  return (
    <PageShell variant="flow">
      <PageHeader title="Cài đặt" tone="indigo" />

      <BoxPanel className="max-w-2xl" title="HIỂN THỊ">
        <div className="flex flex-col gap-3 p-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <Text id={themeLabelId} size="small" weight="medium">
                Giao diện
              </Text>
              <Text size="tiny" skin="muted">
                Màu nền sáng hoặc tối
              </Text>
            </div>
            <SegmentToggle
              aria-labelledby={themeLabelId}
              options={THEME_OPTIONS}
              value={theme}
              onValueChange={handleTheme}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <Text id={tvLabelId} size="small" weight="medium">
                Chế độ màn hình lớn
              </Text>
              <Text size="tiny" skin="muted">
                Phóng CỠ CHỮ để đọc từ xa. Khung giữ nguyên kích thước nên bố cục không vỡ.
              </Text>
            </div>
            <Toggle aria-labelledby={tvLabelId} checked={mode === 'tv'} onCheckedChange={handleTv} />
          </div>

          {mode === 'tv' && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <Text id={scaleLabelId} size="small" weight="medium">
                  Mức phóng chữ
                </Text>
                <Text size="tiny" skin="muted">
                  Trần ×1.3 — cao hơn thì chữ bắt đầu tràn khỏi nút và ô bảng
                </Text>
              </div>
              <SegmentToggle
                aria-labelledby={scaleLabelId}
                options={SCALE_OPTIONS}
                value={String(uiScale)}
                onValueChange={handleScale}
              />
            </div>
          )}
        </div>
      </BoxPanel>
    </PageShell>
  );
});

export default SettingsPage;
