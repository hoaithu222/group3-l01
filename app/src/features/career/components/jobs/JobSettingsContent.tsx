import { router } from 'expo-router';
import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { JobSettings } from '../../api/recruiter.types';
import { useJobSettingsEditor } from '../../hooks/useJobSettingsEditor';
import { CAREER_HREF } from '../../utils/career-routes';
import { BLOCKED_COMPANIES_HREF, OFFERS_HREF } from '../../utils/recruiter-routes';
import { CareerConsentSheet } from './CareerConsentSheet';
import { JobProfileFields } from './JobProfileFields';
import { OpenToWorkCard } from './OpenToWorkCard';
import { RecruiterVisibilityPreview } from './RecruiterVisibilityPreview';

const ARROW = <Icon color="fg-2" name="arrow-right-small" size="sm" />;

/**
 * Thân màn "Tìm việc" (app.md §3): công tắc Open to work → hồ sơ → xem trước cái doanh nghiệp thấy → lối tắt (lời mời, doanh nghiệp đã chặn, quyền riêng tư nghề nghiệp
 * — nơi bật huy hiệu/điểm đóng góp/portfolio). Tách khỏi màn để màn dựng lại bằng `key` khi dữ liệu server đổi (form RHF chỉ đọc `defaultValues` lúc dựng).
 * ⚠️ Lối vào Portfolio (p6-07) chưa có route riêng ở đây — nằm trong màn Nghề nghiệp.
 */
export function JobSettingsContent({ settings }: { settings: JobSettings }) {
  const editor = useJobSettingsEditor(settings);

  return (
    <View className="gap-xl py-xs">
      <OpenToWorkCard
        offline={editor.offline}
        pendingOn={editor.savingOn}
        settings={settings}
        onToggle={editor.toggle}
      />
      <JobProfileFields
        dirty={editor.dirty}
        disabled={editor.offline}
        form={editor.form}
        roles={editor.roles}
        saving={editor.saving && !editor.savingOn}
        onRolesChange={editor.setRoles}
        onSave={() => void editor.save()}
      />
      <RecruiterVisibilityPreview draft={editor.draft} visibility={settings.visibility} />
      {/* Ba lối tắt cùng khuôn hàng điều hướng màn Tôi: ô icon xoay tông (accent · neutral · info) + tiêu đề chữ chính. Cùng icon với
          mục tương ứng ở menu "⋯" của hộp thư (`email`, `shield-user`) để người dùng nhận ra là CÙNG một chỗ. */}
      <Card title="Quản lý">
        <ListItem
          className="py-xs"
          description="Xem và trả lời lời mời từ doanh nghiệp"
          divider
          emphasis="title"
          label="Lời mời đã nhận"
          leading={<IconTile name="email" tone="accent" />}
          trailing={ARROW}
          onPress={() => router.push(OFFERS_HREF)}
        />
        <ListItem
          className="py-xs"
          description="Bỏ chặn khi bạn muốn nhận lời mời trở lại"
          divider
          emphasis="title"
          label="Doanh nghiệp đã chặn"
          leading={<IconTile name="shield-user" tone="neutral" />}
          trailing={ARROW}
          onPress={() => router.push(BLOCKED_COMPANIES_HREF)}
        />
        <ListItem
          className="py-xs"
          description="Huy hiệu, điểm đóng góp và portfolio doanh nghiệp được thấy"
          emphasis="title"
          label="Quyền riêng tư nghề nghiệp"
          leading={<IconTile name="lock" tone="info" />}
          trailing={ARROW}
          onPress={() => router.push(CAREER_HREF)}
        />
      </Card>
      <CareerConsentSheet
        policyUpdated={settings.consentVersion !== null}
        submitting={editor.savingOn}
        visible={editor.consentOpen}
        onClose={() => editor.setConsentOpen(false)}
        onConfirm={editor.confirmConsent}
      />
    </View>
  );
}
