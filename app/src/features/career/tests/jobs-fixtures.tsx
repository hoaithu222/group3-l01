import type {
  CompanyBrief,
  JobSettings,
  OfferDetail,
  OfferItem,
  OfferMessage,
} from '../api/recruiter.types';

export { httpError, renderWithClient } from './fixtures';

/** Dữ liệu mẫu cho test Recruiter board phía sinh viên (p6-08). KHÔNG phải test. */
export const COMPANY: CompanyBrief = {
  id: 'c1',
  logoUrl: null,
  name: 'Công ty Alpha',
  status: 'APPROVED',
};

export function makeSettings(over: Partial<JobSettings> = {}): JobSettings {
  return {
    consentVersion: null,
    headline: null,
    location: null,
    openToWork: false,
    openToWorkChangedAt: null,
    preferredRoles: [],
    recruiterEnabled: true,
    requiredConsentVersion: 'v1',
    visibility: {
      appearInOthersPortfolios: false,
      proofTitles: false,
      showContribution: false,
      showQuiz: false,
      showSkills: true,
    },
    ...over,
  };
}

export function makeOffer(over: Partial<OfferItem> = {}): OfferItem {
  return {
    company: COMPANY,
    employmentType: 'INTERNSHIP',
    expiresAt: '2026-10-27T00:00:00.000Z',
    id: 'o1',
    readAt: null,
    sentAt: '2026-09-27T00:00:00.000Z',
    status: 'SENT',
    threadLocked: false,
    title: 'Thực tập sinh Frontend',
    unreadMessages: 0,
    ...over,
  };
}

export function makeDetail(over: Partial<OfferDetail> = {}): OfferDetail {
  return {
    ...makeOffer(),
    declineReason: null,
    jdUrl: null,
    location: 'TP. Hồ Chí Minh',
    message: 'Chúng tôi thấy huy hiệu ReactJS của bạn và muốn mời bạn thực tập.',
    recruiter: { name: 'Chị Lan' },
    respondedAt: null,
    sharedEmail: null,
    threadOpen: false,
    ...over,
  };
}

export function makeMessage(over: Partial<OfferMessage> = {}): OfferMessage {
  return {
    content: 'Chào bạn!',
    createdAt: '2026-09-27T08:00:00.000Z',
    id: 'm1',
    side: 'COMPANY',
    ...over,
  };
}
