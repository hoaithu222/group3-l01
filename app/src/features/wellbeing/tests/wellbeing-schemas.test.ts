import {
  parseAlertPayload,
  parseHistory,
  parseSetting,
  WellbeingContractError,
} from '../api/wellbeing.schemas';

/**
 * Phản hồi BE và sự kiện socket — chỗ SAI THÌ IM LẶNG: điểm số không được lọt vào cache/UI (kế hoạch không cho hiện điểm), dữ liệu hỏng bị BỎ chứ không thành một mức sai,
 * lỗi hợp đồng không kèm dữ liệu sức khoẻ, sự kiện lạ bị bỏ qua.
 */
describe('phản hồi BE — cắt điểm số, bỏ phần hỏng', () => {
  const latest = {
    ackAction: null,
    alerted: true,
    alertedAt: '2026-09-26T05:00:00.000Z',
    date: '2026-09-26',
    factors: [
      {
        aggregate: 'MAX',
        days: 7,
        label: 'A',
        metric: 'longestContinuousMinutes',
        points: 30,
        ruleId: 'r1',
        threshold: 180,
        value: 195,
      },
    ],
    id: 'as1',
    level: 'HIGH',
    riskScore: 72,
    ruleVersion: 3,
    suggestion: 'BREAK',
  };
  const raw = {
    alertsEnabled: true,
    enabled: true,
    latest,
    optedInAt: '2026-09-20T00:00:00.000Z',
    pendingAlert: { id: 'as1', level: 'HIGH', suggestion: 'BREAK' },
    preferredBreak: null,
  };

  it('KHÔNG giữ `riskScore`, `points`, `ruleVersion`, `threshold` (không điểm số nào lọt vào cache/UI)', () => {
    const parsed = parseSetting(raw);
    const text = JSON.stringify(parsed);

    expect(parsed.latest?.level).toBe('HIGH');
    for (const forbidden of ['riskScore', 'points', 'ruleVersion', 'threshold', 'alertedAt']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('đánh giá/ngày hỏng bị BỎ (không thành mức sai); phần còn lại vẫn dùng được', () => {
    const goodDaily = {
      activeMinutes: 60,
      date: '2026-09-26',
      eventsCount: 3,
      lateNightEvents: 0,
      lateNightMinutes: 0,
      longestContinuousMinutes: 30,
    };
    const parsed = parseHistory({
      assessments: [{ date: '2026-09-25', factors: [], id: 'x', level: 'CRITICAL' }, latest],
      dailies: [{ activeMinutes: 'nhiều', date: '2026-09-25' }, goodDaily],
      days: 7,
    });

    expect(parsed.assessments.map((a) => a.id)).toEqual(['as1']);
    expect(parsed.dailies.map((d) => d.date)).toEqual(['2026-09-26']);
  });

  it('cài đặt sai hợp đồng ⇒ lỗi tiếng Việt, KHÔNG kèm dữ liệu nhận được', () => {
    expect(() => parseSetting({ enabled: 'yes' })).toThrow(WellbeingContractError);
    let message = '';
    try {
      parseSetting({ enabled: 'yes', secret: 'du-lieu-suc-khoe' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('không đúng định dạng');
    expect(message).not.toContain('du-lieu-suc-khoe');
  });

  it('`latest` hỏng ⇒ null thay vì làm hỏng cả cài đặt', () => {
    const parsed = parseSetting({ ...raw, latest: { id: 'x', level: 'CRITICAL' } });
    expect(parsed.latest).toBeNull();
    expect(parsed.enabled).toBe(true);
  });
});

describe('sự kiện socket wellbeing:alert', () => {
  it('payload hợp lệ (v = 1, MEDIUM/HIGH) ⇒ chỉ id + mức + gợi ý (bỏ `serverNow`…)', () => {
    expect(
      parseAlertPayload({
        assessmentId: 'a1',
        level: 'HIGH',
        serverNow: 1,
        suggestion: 'SLEEP',
        v: 1,
      }),
    ).toEqual({ assessmentId: 'a1', level: 'HIGH', suggestion: 'SLEEP' });
  });

  it.each([
    ['LOW (BE không bao giờ gửi)', { assessmentId: 'a1', level: 'LOW', v: 1 }],
    ['phiên bản lạ', { assessmentId: 'a1', level: 'HIGH', v: 2 }],
    ['thiếu id', { level: 'HIGH', v: 1 }],
    ['không phải object', 'wellbeing'],
    ['null', null],
  ])('bỏ qua: %s', (_name, payload) => {
    expect(parseAlertPayload(payload)).toBeNull();
  });

  it('gợi ý lạ ⇒ null (vẫn hiện được cảnh báo, chỉ mất dòng gợi ý)', () => {
    const payload = { assessmentId: 'a1', level: 'MEDIUM', suggestion: 'MEDITATE', v: 1 };
    expect(parseAlertPayload(payload)?.suggestion).toBeNull();
  });
});
