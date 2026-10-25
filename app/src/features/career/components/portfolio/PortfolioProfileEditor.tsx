import { router } from 'expo-router';
import { View } from 'react-native';
import { useWatch } from 'react-hook-form';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { FormInput } from '@/shared/ui/input';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { Portfolio } from '../../api/portfolio.types';
import { usePortfolioProfileForm } from '../../hooks/usePortfolioProfileForm';
import { graphemeLength } from '../../utils/grapheme';
import { LinksEditor } from './LinksEditor';
import { PortfolioConflictAlert } from './PortfolioConflictAlert';
import { PortfolioFormFooter } from './PortfolioFormFooter';
import { PortfolioImageField } from './PortfolioImageField';
import { SlugField } from './SlugField';

export interface PortfolioProfileEditorProps {
  portfolio: Portfolio | null;
  reload: () => Promise<Portfolio | null | undefined>;
}

/**
 * Màn "Thông tin" (app.md p6-07 §3): tên hiển thị, tiêu đề nghề nghiệp, giới thiệu (đếm grapheme theo `limits.portfolio.bioMax`), ảnh đại diện (tuỳ chọn — bỏ trống = ảnh tài khoản),
 * liên kết, và khối đường dẫn riêng. Chưa có hồ sơ (`portfolio: null`) thì lần lưu đầu TẠO hồ sơ (BE `expectedVersion: 0`, slug tự sinh) — khối đường dẫn chỉ hiện sau đó.
 * Dựng CẢ `Screen` ở đây (không phải ở màn cha) vì nút Lưu ở `footer` cần `submit` của hook form — hook chỉ gọi được SAU khi hồ sơ đã tải xong. Offline ⇒ chặn lưu.
 */
export function PortfolioProfileEditor({ portfolio, reload }: PortfolioProfileEditorProps) {
  const f = usePortfolioProfileForm({
    onSaved: () => {
      hapticSuccess();
      showToast('success', 'Đã lưu thông tin hồ sơ');
      router.back();
    },
    portfolio,
    reload,
  });
  const offline = useConnectionState() === 'offline';
  const { control, setValue } = f.form;
  const bio = useWatch({ control, name: 'bio' });
  const headline = useWatch({ control, name: 'headline' });
  const avatarAssetId = useWatch({ control, name: 'avatarAssetId' });
  const displayName = useWatch({ control, name: 'displayName' });

  return (
    <Screen
      footer={
        <PortfolioFormFooter
          disabled={offline}
          label="Lưu thông tin"
          loading={f.pending}
          notice={
            offline ? <Alert description="Cần kết nối mạng để lưu hồ sơ." tone="warning" /> : null
          }
          onPress={() => void f.submit()}
        />
      }
      header={<AppBar title="Thông tin hồ sơ" onBack={router.back} />}
      keyboardAware
    >
      <View className="gap-lg py-xs">
        {f.conflict ? <PortfolioConflictAlert onReload={() => void f.reloadLatest()} /> : null}
        {f.submitError ? <Alert description={f.submitError} tone="error" /> : null}

        <PortfolioImageField
          assetId={avatarAssetId}
          clearLabel="Dùng ảnh tài khoản"
          disabled={f.pending}
          hint="Không chọn thì trang dùng ảnh đại diện tài khoản của bạn."
          label="Ảnh đại diện"
          name={displayName}
          variant="avatar"
          onChange={(assetId) => setValue('avatarAssetId', assetId, { shouldDirty: true })}
        />

        <View className="gap-sm">
          <FormInput
            control={control}
            disabled={f.pending}
            hint={`${graphemeLength(displayName)}/${f.limits.displayNameMax}`}
            label="Tên hiển thị"
            name="displayName"
            placeholder="Tên hiện trên trang công khai"
            required
            returnKeyType="next"
          />
          <FormInput
            control={control}
            disabled={f.pending}
            hint={`${graphemeLength(headline)}/${f.limits.headlineMax}`}
            label="Tiêu đề nghề nghiệp"
            message="Ví dụ: Sinh viên Công nghệ thông tin, thiên hướng Frontend"
            name="headline"
            placeholder="Bạn làm gì, quan tâm lĩnh vực nào"
            returnKeyType="next"
          />
          <FormInput
            control={control}
            disabled={f.pending}
            hint={`${graphemeLength(bio)}/${f.limits.bioMax}`}
            label="Giới thiệu"
            labelInside
            message="Xuống dòng để tách đoạn. Trang công khai chỉ hiển thị chữ, không chạy mã."
            multiline
            name="bio"
            placeholder="Giới thiệu ngắn về bạn và điều bạn theo đuổi"
            textAlignVertical="top"
          />
        </View>

        <LinksEditor
          control={control}
          disabled={f.pending}
          labelMax={f.limits.linkLabelMax}
          max={f.limits.linksMax}
          urlMax={f.limits.linkUrlMax}
        />

        {portfolio ? (
          <SlugField
            offline={offline}
            portfolio={portfolio}
            version={f.baseVersion}
            onSaved={(saved) => f.syncVersion(saved.version)}
          />
        ) : null}
      </View>
    </Screen>
  );
}
