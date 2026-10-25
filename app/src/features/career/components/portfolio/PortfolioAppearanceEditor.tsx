import { router } from 'expo-router';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { Portfolio } from '../../api/portfolio.types';
import { usePortfolioAppearance } from '../../hooks/usePortfolioAppearance';
import { usePortfolioTemplates } from '../../queries/portfolio.queries';
import { portfolioPreviewHref } from '../../utils/portfolio-routes';
import { PortfolioConflictAlert } from './PortfolioConflictAlert';
import { PortfolioFormFooter } from './PortfolioFormFooter';
import { SectionOrderList } from './SectionOrderList';
import { TemplatePicker } from './TemplatePicker';

export interface PortfolioAppearanceEditorProps {
  portfolio: Portfolio;
  reload: () => Promise<Portfolio | null | undefined>;
}

/**
 * Màn "Giao diện" (app.md p6-07 §3): mẫu + màu nhấn + bật/tắt/sắp xếp mục + cho phép công cụ tìm kiếm. Sửa NHÁP, chỉ lưu khi bấm "Lưu" (lý do ở `usePortfolioAppearance`);
 * "Xem trước với mẫu này" mở trang xem trước với mẫu/màu ĐANG CHỌN (chưa lưu). ⚠️ Xem trước chỉ áp mẫu + màu — bật/tắt/thứ tự mục và SEO chưa lưu thì bản xem trước vẫn theo bản đã lưu.
 * Cùng lý do `PortfolioProfileEditor`: dựng cả `Screen` ở đây vì nút ở `footer` cần state của hook.
 */
export function PortfolioAppearanceEditor({ portfolio, reload }: PortfolioAppearanceEditorProps) {
  const a = usePortfolioAppearance({
    onSaved: () => {
      hapticSuccess();
      showToast('success', 'Đã lưu giao diện');
      router.back();
    },
    portfolio,
    reload,
  });
  const templates = usePortfolioTemplates();
  const offline = useConnectionState() === 'offline';
  const trial = { accent: a.theme.accent, template: a.theme.template };

  return (
    <Screen
      footer={
        <PortfolioFormFooter
          disabled={!a.dirty || offline}
          label="Lưu giao diện"
          loading={a.pending}
          secondary={
            <Button
              disabled={offline}
              fullWidth
              iconLeft="view"
              label="Xem trước với mẫu này"
              variant="secondary"
              onPress={() => router.push(portfolioPreviewHref(trial))}
            />
          }
          onPress={() => void a.submit()}
        />
      }
      header={<AppBar title="Giao diện" onBack={router.back} />}
    >
      <View className="gap-xl py-xs">
        {a.conflict ? <PortfolioConflictAlert onReload={() => void a.reloadLatest()} /> : null}
        {a.submitError ? <Alert description={a.submitError} tone="error" /> : null}

        <Section icon="image" title="Mẫu trình bày">
          {templates.isError ? (
            <Alert
              actions={
                <Button
                  label="Thử lại"
                  size="xs"
                  variant="secondary"
                  onPress={() => void templates.refetch()}
                />
              }
              description="Không tải được danh sách mẫu."
              tone="error"
            />
          ) : (
            <TemplatePicker
              accent={a.theme.accent}
              disabled={a.pending}
              template={a.theme.template}
              templates={templates.data}
              onAccent={a.setAccent}
              onTemplate={a.setTemplate}
            />
          )}
        </Section>

        <Section icon="document" title="Các mục trên trang">
          <SectionOrderList
            disabled={a.pending}
            sections={a.sections}
            onMove={a.moveSection}
            onToggle={a.toggleSection}
          />
        </Section>

        <Section icon="search" title="Công cụ tìm kiếm">
          <Toggle
            description="Mặc định TẮT: chỉ người có link mới thấy trang. Bật thì Google và các công cụ tìm kiếm có thể hiển thị trang của bạn sau khi công khai."
            disabled={a.pending}
            label="Cho phép công cụ tìm kiếm hiển thị hồ sơ"
            value={a.seoIndexable}
            onChange={a.setSeoIndexable}
          />
        </Section>
      </View>
    </Screen>
  );
}
