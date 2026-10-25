import { getBlockPort } from "../blocks/public";
import { createChannelBootstrap, createChannelGrantPort } from "../channels";
import { createMemberContactPort } from "../conversations/public";
import { createUserContactLookup } from "../users/public";
import { PrismaInvitationRepository, PrismaMembershipRepository } from "./repositories";
import { RuntimeGuestConfig } from "./services/guest-config";
import { GuestService } from "./services/guest.service";
import { InvitationAcceptService } from "./services/invitation-accept.service";
import { InvitationCreateService } from "./services/invitation-create.service";
import { JoinRequestService } from "./services/join-request.service";
import { MemberAddService } from "./services/member-add.service";
import { MemberQueryService } from "./services/member-query.service";

/**
 * DI dùng chung cho các route p3-04 (lời mời email, khách, duyệt tham gia) — một chỗ nối repo → service, giống
 * `resources.container.ts`. Khởi tạo lười (lần gọi đầu) để import file route không kéo `channels` khi chưa cần.
 */
export interface AccessContainer {
  invitationCreate: InvitationCreateService;
  invitationAccept: InvitationAcceptService;
  guests: GuestService;
  joinRequests: JoinRequestService;
  memberQuery: MemberQueryService;
  /** Tra người theo email/SĐT + thêm thẳng vào nhóm (OWNER/ADMIN). */
  memberAdd: MemberAddService;
}

let container: AccessContainer | null = null;

export function getAccessContainer(): AccessContainer {
  if (container) return container;
  const memberships = new PrismaMembershipRepository();
  const invitations = new PrismaInvitationRepository();
  const guestConfig = new RuntimeGuestConfig();
  const channelBootstrap = createChannelBootstrap();
  const channelGrant = createChannelGrantPort();
  container = {
    invitationCreate: new InvitationCreateService(invitations, memberships, guestConfig),
    invitationAccept: new InvitationAcceptService(invitations, memberships, channelBootstrap, channelGrant, guestConfig),
    guests: new GuestService(memberships, invitations, channelGrant, guestConfig),
    joinRequests: new JoinRequestService(memberships, invitations, channelBootstrap),
    memberQuery: new MemberQueryService(memberships, createMemberContactPort()),
    memberAdd: new MemberAddService(memberships, invitations, createUserContactLookup(), channelBootstrap, getBlockPort()),
  };
  return container;
}
