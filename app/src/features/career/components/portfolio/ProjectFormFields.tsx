import { View } from 'react-native';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

import { FormInput } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';

import type { PortfolioProject } from '../../api/portfolio.types';
import type { PortfolioLimits } from '../../constants/portfolio.constants';
import type { ProjectFormValues } from '../../schemas/portfolio-project.schemas';
import { graphemeLength } from '../../utils/grapheme';
import { HighlightsEditor } from './HighlightsEditor';
import { PeriodField } from './PeriodField';
import { PortfolioImageField } from './PortfolioImageField';
import { TeammatesPrivacyNote } from './TeammatesPrivacyNote';

export interface ProjectFormFieldsProps {
  control: Control<ProjectFormValues>;
  setValue: UseFormSetValue<ProjectFormValues>;
  limits: PortfolioLimits;
  project: PortfolioProject;
  disabled: boolean;
}

/**
 * Các ô nội dung của một dự án (app.md p6-07 §3 "Sửa dự án"): tiêu đề (mặc định = tên nhóm nhưng SỬA ĐƯỢC — tên nhóm có thể riêng tư), tóm tắt, vai trò, thời gian, ≤ 3 điểm nổi bật, ảnh bìa,
 * công tắc hiện/ẩn và "Hiện tên đồng đội". ⛔ Không có ô nào cho tiêu đề task/tên kênh/nội dung tài liệu: trang công khai không bao giờ nêu những thứ đó.
 */
export function ProjectFormFields({
  control,
  disabled,
  limits,
  project,
  setValue,
}: ProjectFormFieldsProps) {
  const title = useWatch({ control, name: 'title' });
  const summary = useWatch({ control, name: 'summary' });
  const role = useWatch({ control, name: 'role' });
  const coverAssetId = useWatch({ control, name: 'coverAssetId' });
  const visible = useWatch({ control, name: 'visible' });
  const showTeammates = useWatch({ control, name: 'showTeammates' });
  const { namedTeammates, teammatesCount } = project.snapshot;

  return (
    <View className="gap-lg">
      <View className="gap-sm">
        <FormInput
          control={control}
          disabled={disabled}
          hint={`${graphemeLength(title)}/${limits.projectTitleMax}`}
          label="Tiêu đề dự án"
          message="Mặc định là tên nhóm. Bạn nên đổi nếu tên nhóm mang thông tin riêng."
          name="title"
          placeholder="Tên dự án hiển thị trên trang của bạn"
          required
          returnKeyType="next"
        />
        <FormInput
          control={control}
          disabled={disabled}
          hint={`${graphemeLength(summary)}/${limits.summaryMax}`}
          label="Tóm tắt"
          labelInside
          multiline
          name="summary"
          placeholder="Dự án làm gì, bạn góp sức ở đâu"
          textAlignVertical="top"
        />
        <FormInput
          control={control}
          disabled={disabled}
          hint={`${graphemeLength(role)}/${limits.roleMax}`}
          label="Vai trò của bạn"
          name="role"
          placeholder="Ví dụ: Lập trình Frontend"
          returnKeyType="done"
        />
        <PeriodField control={control} disabled={disabled} label="Bắt đầu" name="periodFrom" />
        <PeriodField control={control} disabled={disabled} label="Kết thúc" name="periodTo" />
      </View>

      <HighlightsEditor
        control={control}
        disabled={disabled}
        itemMax={limits.highlightMax}
        max={limits.highlightsMax}
      />

      <PortfolioImageField
        assetId={coverAssetId}
        clearLabel="Bỏ ảnh bìa"
        disabled={disabled}
        hint="Ảnh ngang hiển thị đầu phần dự án trên trang. Không bắt buộc."
        label="Ảnh bìa dự án"
        variant="cover"
        onChange={(assetId) => setValue('coverAssetId', assetId, { shouldDirty: true })}
      />

      <View className="gap-sm">
        <Toggle
          description="Tắt thì dự án vẫn nằm trong hồ sơ nhưng không hiện trên trang công khai."
          disabled={disabled}
          label="Hiện dự án này trên trang"
          value={visible}
          onChange={(value) => setValue('visible', value, { shouldDirty: true })}
        />
        <Toggle
          description="Mặc định TẮT: trang chỉ ghi số đồng đội, không nêu tên ai."
          disabled={disabled}
          label="Hiện tên đồng đội"
          value={showTeammates}
          onChange={(value) => setValue('showTeammates', value, { shouldDirty: true })}
        />
        <TeammatesPrivacyNote
          enabled={showTeammates}
          namedCount={project.showTeammates ? namedTeammates.length : null}
          teammatesCount={teammatesCount}
        />
      </View>
    </View>
  );
}
