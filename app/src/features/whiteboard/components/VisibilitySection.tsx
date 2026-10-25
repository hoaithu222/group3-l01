import { Text } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Radio, RadioGroup } from '@/shared/ui/radio';
import { Section } from '@/shared/ui/section';

import type { WhiteboardVisibility } from '../api/whiteboard.types';
import { VISIBILITY_HINT, VISIBILITY_LABEL } from '../constants/whiteboard.constants';

export interface VisibilitySectionProps {
  /** Người tạo — chỉ họ được chuyển về riêng tư (quản trị nhóm đặt PRIVATE là tự khoá mình ra khỏi bảng). */
  canMakePrivate: boolean;
  /** Có quyền `manage` (server tính) và bảng còn hoạt động. */
  canManage: boolean;
  onChange: (next: WhiteboardVisibility) => void;
  value: WhiteboardVisibility;
}

/** "Ai xem được" của bảng: hai lựa chọn kèm mô tả hệ quả bằng chữ. Không có quyền quản lý thì chỉ đọc (radio khoá, giá trị hiện tại vẫn hiện). */
export function VisibilitySection({
  canMakePrivate,
  canManage,
  onChange,
  value,
}: VisibilitySectionProps) {
  return (
    // `Section` (tiêu đề NGOÀI thẻ) + `Card` (nền) — khuôn nhóm chung của app, thay cho tiêu đề chữ + radio nằm trơn trên nền màn.
    <Section title="Ai xem được">
      <Card>
        <RadioGroup
          accessibilityLabel="Ai xem được bảng trắng"
          value={value}
          onChange={(next) => onChange(next as WhiteboardVisibility)}
        >
          <Radio disabled={!canManage} label={VISIBILITY_LABEL.WORKSPACE} value="WORKSPACE" />
          <Radio
            disabled={!canManage || !canMakePrivate}
            label={VISIBILITY_LABEL.PRIVATE}
            value="PRIVATE"
          />
        </RadioGroup>
        <Text className="text-body-md text-fg-2">{VISIBILITY_HINT[value]}</Text>
        {canManage && !canMakePrivate && value === 'WORKSPACE' ? (
          <Text className="text-body-md text-fg-2">Chỉ người tạo mới chuyển được về riêng tư.</Text>
        ) : null}
      </Card>
    </Section>
  );
}
