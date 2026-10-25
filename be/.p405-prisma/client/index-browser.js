
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  normalizedName: 'normalizedName',
  name: 'name',
  role: 'role',
  status: 'status',
  timezone: 'timezone',
  avatarAssetId: 'avatarAssetId',
  sessionVersion: 'sessionVersion',
  deletionRequestedAt: 'deletionRequestedAt',
  deletionGraceUntil: 'deletionGraceUntil',
  anonymizedAt: 'anonymizedAt',
  passwordHash: 'passwordHash',
  passwordChangedAt: 'passwordChangedAt',
  emailVerified: 'emailVerified',
  emailVerifiedAt: 'emailVerifiedAt',
  verificationToken: 'verificationToken',
  verificationTokenExpires: 'verificationTokenExpires',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RefreshTokenScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  token: 'token',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt'
};

exports.Prisma.SessionScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  refreshTokenHash: 'refreshTokenHash',
  previousTokenHash: 'previousTokenHash',
  rotatedAt: 'rotatedAt',
  userAgent: 'userAgent',
  ipAddress: 'ipAddress',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  lastUsedAt: 'lastUsedAt',
  revokedAt: 'revokedAt',
  authMethod: 'authMethod',
  deviceId: 'deviceId',
  biometricCredentialId: 'biometricCredentialId'
};

exports.Prisma.BiometricCredentialScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  deviceId: 'deviceId',
  platform: 'platform',
  deviceName: 'deviceName',
  biometryKind: 'biometryKind',
  secretHash: 'secretHash',
  activeKey: 'activeKey',
  status: 'status',
  failedAttempts: 'failedAttempts',
  expiresAt: 'expiresAt',
  lastUsedAt: 'lastUsedAt',
  revokedAt: 'revokedAt',
  revokeReason: 'revokeReason',
  revokedBy: 'revokedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AssetScalarFieldEnum = {
  id: 'id',
  ownerId: 'ownerId',
  workspaceId: 'workspaceId',
  scope: 'scope',
  kind: 'kind',
  variant: 'variant',
  parentAssetId: 'parentAssetId',
  status: 'status',
  uploadMethod: 'uploadMethod',
  mime: 'mime',
  declaredSize: 'declaredSize',
  size: 'size',
  originalName: 'originalName',
  storageKey: 'storageKey',
  checksum: 'checksum',
  width: 'width',
  height: 'height',
  durationMs: 'durationMs',
  thumbnailAssetId: 'thumbnailAssetId',
  rejectReason: 'rejectReason',
  attachedType: 'attachedType',
  attachedId: 'attachedId',
  createdAt: 'createdAt',
  processedAt: 'processedAt',
  readyAt: 'readyAt',
  deletedAt: 'deletedAt',
  lastUnlinkedAt: 'lastUnlinkedAt'
};

exports.Prisma.AssetLinkScalarFieldEnum = {
  id: 'id',
  assetId: 'assetId',
  targetType: 'targetType',
  targetId: 'targetId',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  actorId: 'actorId',
  actorRole: 'actorRole',
  action: 'action',
  targetType: 'targetType',
  targetId: 'targetId',
  workspaceId: 'workspaceId',
  reason: 'reason',
  metadata: 'metadata',
  ip: 'ip',
  userAgent: 'userAgent',
  at: 'at'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  type: 'type',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  workspaceId: 'workspaceId',
  actorId: 'actorId',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  refs: 'refs',
  dedupeKey: 'dedupeKey',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationRecipientScalarFieldEnum = {
  id: 'id',
  notificationId: 'notificationId',
  recipientId: 'recipientId',
  kind: 'kind',
  inInbox: 'inInbox',
  dedupeKey: 'dedupeKey',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  workspaceId: 'workspaceId',
  readAt: 'readAt',
  seenAt: 'seenAt',
  pushStatus: 'pushStatus',
  skipReason: 'skipReason',
  deliveredPushAt: 'deliveredPushAt',
  createdAt: 'createdAt',
  kindRank: 'kindRank',
  streamKey: 'streamKey',
  streamSeq: 'streamSeq',
  filterBucket: 'filterBucket',
  cancelledAt: 'cancelledAt'
};

exports.Prisma.NotificationPreferenceScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  scope: 'scope',
  scopeKey: 'scopeKey',
  mode: 'mode',
  mutedUntil: 'mutedUntil',
  dndUntil: 'dndUntil',
  lockScreenPreview: 'lockScreenPreview',
  directMode: 'directMode',
  groupMode: 'groupMode',
  channelMode: 'channelMode',
  lockScreenLevel: 'lockScreenLevel',
  sound: 'sound',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReadStateScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  streamType: 'streamType',
  streamId: 'streamId',
  workspaceId: 'workspaceId',
  channelId: 'channelId',
  lastReadSeq: 'lastReadSeq',
  lastReadAt: 'lastReadAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkspaceMembershipScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  userId: 'userId',
  role: 'role',
  status: 'status',
  displayName: 'displayName',
  joinedAt: 'joinedAt',
  leftAt: 'leftAt',
  expiresAt: 'expiresAt',
  invitedBy: 'invitedBy',
  inviteLinkId: 'inviteLinkId',
  banReason: 'banReason',
  removedBy: 'removedBy',
  isFavorite: 'isFavorite',
  position: 'position',
  notifyMode: 'notifyMode',
  lastVisitedAt: 'lastVisitedAt',
  expiryVersion: 'expiryVersion',
  leftReason: 'leftReason',
  requestMessage: 'requestMessage',
  requestedAt: 'requestedAt',
  decidedBy: 'decidedBy',
  decidedAt: 'decidedAt',
  invitationId: 'invitationId'
};

exports.Prisma.ChannelGrantScalarFieldEnum = {
  id: 'id',
  channelId: 'channelId',
  workspaceId: 'workspaceId',
  userId: 'userId',
  level: 'level',
  source: 'source',
  roleRef: 'roleRef',
  subjectKey: 'subjectKey',
  grantedBy: 'grantedBy',
  createdAt: 'createdAt'
};

exports.Prisma.WorkspaceScalarFieldEnum = {
  id: 'id',
  name: 'name',
  normalizedName: 'normalizedName',
  description: 'description',
  avatarAssetId: 'avatarAssetId',
  ownerId: 'ownerId',
  defaultChannelId: 'defaultChannelId',
  status: 'status',
  archivedAt: 'archivedAt',
  archivedBy: 'archivedBy',
  archivedReason: 'archivedReason',
  archiveNote: 'archiveNote',
  memberCount: 'memberCount',
  lastActivityAt: 'lastActivityAt',
  version: 'version',
  storageUsedBytes: 'storageUsedBytes',
  joinPolicy: 'joinPolicy',
  guestPolicy: 'guestPolicy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InviteLinkScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  tokenHash: 'tokenHash',
  tokenPrefix: 'tokenPrefix',
  role: 'role',
  maxUses: 'maxUses',
  remainingUses: 'remainingUses',
  usesCount: 'usesCount',
  expiresAt: 'expiresAt',
  revokedAt: 'revokedAt',
  revokedBy: 'revokedBy',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  lastUsedAt: 'lastUsedAt'
};

exports.Prisma.WorkspaceDailyStatScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  date: 'date',
  messages: 'messages',
  activeMembers: 'activeMembers',
  files: 'files',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChannelScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  name: 'name',
  normalizedName: 'normalizedName',
  description: 'description',
  type: 'type',
  visibility: 'visibility',
  postingPolicy: 'postingPolicy',
  status: 'status',
  archiveReason: 'archiveReason',
  archivedAt: 'archivedAt',
  archivedBy: 'archivedBy',
  isDefault: 'isDefault',
  position: 'position',
  settings: 'settings',
  lastSeq: 'lastSeq',
  lastMessageAt: 'lastMessageAt',
  lastMessageId: 'lastMessageId',
  memberCount: 'memberCount',
  createdBy: 'createdBy',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChannelMembershipScalarFieldEnum = {
  id: 'id',
  channelId: 'channelId',
  workspaceId: 'workspaceId',
  userId: 'userId',
  notifyMode: 'notifyMode',
  pinned: 'pinned',
  position: 'position',
  joinedAt: 'joinedAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MessageScalarFieldEnum = {
  id: 'id',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  workspaceId: 'workspaceId',
  threadId: 'threadId',
  threadKey: 'threadKey',
  seq: 'seq',
  authorId: 'authorId',
  kind: 'kind',
  systemType: 'systemType',
  systemPayload: 'systemPayload',
  clientMessageId: 'clientMessageId',
  dedupeKey: 'dedupeKey',
  content: 'content',
  normalizedContent: 'normalizedContent',
  replyToId: 'replyToId',
  pinnedAt: 'pinnedAt',
  pinnedBy: 'pinnedBy',
  editedAt: 'editedAt',
  version: 'version',
  deletedAt: 'deletedAt',
  deletedBy: 'deletedBy',
  deleteReason: 'deleteReason',
  deleteMode: 'deleteMode',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MessageReactionScalarFieldEnum = {
  id: 'id',
  messageId: 'messageId',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  userId: 'userId',
  emoji: 'emoji',
  createdAt: 'createdAt'
};

exports.Prisma.MessageHideScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  messageId: 'messageId',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  seq: 'seq',
  createdAt: 'createdAt'
};

exports.Prisma.DeviceTokenScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  deviceId: 'deviceId',
  platform: 'platform',
  kind: 'kind',
  token: 'token',
  bundleId: 'bundleId',
  environment: 'environment',
  appVersion: 'appVersion',
  locale: 'locale',
  failureCount: 'failureCount',
  lastSeenAt: 'lastSeenAt',
  revokedAt: 'revokedAt',
  revokeReason: 'revokeReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SystemConfigScalarFieldEnum = {
  id: 'id',
  key: 'key',
  value: 'value',
  version: 'version',
  updatedBy: 'updatedBy',
  reason: 'reason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CounterScalarFieldEnum = {
  id: 'id',
  key: 'key',
  seq: 'seq'
};

exports.Prisma.OutboxEventScalarFieldEnum = {
  id: 'id',
  type: 'type',
  aggregateType: 'aggregateType',
  aggregateId: 'aggregateId',
  queue: 'queue',
  jobName: 'jobName',
  payload: 'payload',
  dedupeKey: 'dedupeKey',
  delayMs: 'delayMs',
  status: 'status',
  attempts: 'attempts',
  lastError: 'lastError',
  availableAt: 'availableAt',
  lockedUntil: 'lockedUntil',
  lockedBy: 'lockedBy',
  createdAt: 'createdAt',
  dispatchedAt: 'dispatchedAt'
};

exports.Prisma.UserBlockScalarFieldEnum = {
  id: 'id',
  blockerId: 'blockerId',
  blockedId: 'blockedId',
  createdAt: 'createdAt'
};

exports.Prisma.ReportScalarFieldEnum = {
  id: 'id',
  reporterId: 'reporterId',
  targetType: 'targetType',
  targetId: 'targetId',
  groupKey: 'groupKey',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  scopeIsPrivate: 'scopeIsPrivate',
  workspaceId: 'workspaceId',
  targetAuthorId: 'targetAuthorId',
  handlerLevel: 'handlerLevel',
  reason: 'reason',
  description: 'description',
  status: 'status',
  resolution: 'resolution',
  resolutionNote: 'resolutionNote',
  resolvedBy: 'resolvedBy',
  resolvedAtLevel: 'resolvedAtLevel',
  resolvedAt: 'resolvedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ConversationScalarFieldEnum = {
  id: 'id',
  kind: 'kind',
  workspaceId: 'workspaceId',
  meetingId: 'meetingId',
  meetingKey: 'meetingKey',
  directKey: 'directKey',
  title: 'title',
  normalizedTitle: 'normalizedTitle',
  avatarAssetId: 'avatarAssetId',
  ownerId: 'ownerId',
  createdBy: 'createdBy',
  status: 'status',
  lastSeq: 'lastSeq',
  lastMessageAt: 'lastMessageAt',
  lastMessageId: 'lastMessageId',
  activityAt: 'activityAt',
  memberCount: 'memberCount',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  archivedAt: 'archivedAt',
  dissolvedAt: 'dissolvedAt',
  dissolvedBy: 'dissolvedBy',
  dissolveReason: 'dissolveReason',
  allowGuests: 'allowGuests'
};

exports.Prisma.ConversationMemberScalarFieldEnum = {
  id: 'id',
  conversationId: 'conversationId',
  userId: 'userId',
  kind: 'kind',
  workspaceId: 'workspaceId',
  role: 'role',
  status: 'status',
  peerUserId: 'peerUserId',
  joinedAt: 'joinedAt',
  leftAt: 'leftAt',
  addedBy: 'addedBy',
  lastReadSeq: 'lastReadSeq',
  lastReadAt: 'lastReadAt',
  unreadCount: 'unreadCount',
  mentionsSinceRead: 'mentionsSinceRead',
  notifyMode: 'notifyMode',
  mutedUntil: 'mutedUntil',
  pinnedAt: 'pinnedAt',
  archivedAt: 'archivedAt',
  markedUnread: 'markedUnread',
  hiddenBeforeSeq: 'hiddenBeforeSeq',
  activityAt: 'activityAt',
  searchText: 'searchText',
  version: 'version'
};

exports.Prisma.ThreadScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  channelId: 'channelId',
  parentMessageId: 'parentMessageId',
  parentAuthorId: 'parentAuthorId',
  replyCount: 'replyCount',
  lastReplySeq: 'lastReplySeq',
  lastReplyAt: 'lastReplyAt',
  lastReplierIds: 'lastReplierIds',
  subscriberCount: 'subscriberCount',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ThreadSubscriptionScalarFieldEnum = {
  id: 'id',
  threadId: 'threadId',
  channelId: 'channelId',
  userId: 'userId',
  state: 'state',
  updatedAt: 'updatedAt',
  createdAt: 'createdAt'
};

exports.Prisma.SavedMessageScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  messageId: 'messageId',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  workspaceId: 'workspaceId',
  threadId: 'threadId',
  createdAt: 'createdAt'
};

exports.Prisma.FolderScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  parentId: 'parentId',
  parentKey: 'parentKey',
  path: 'path',
  depth: 'depth',
  name: 'name',
  normalizedName: 'normalizedName',
  nameKey: 'nameKey',
  createdBy: 'createdBy',
  deletedAt: 'deletedAt',
  deletedBy: 'deletedBy',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ResourceScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  folderId: 'folderId',
  folderKey: 'folderKey',
  assetId: 'assetId',
  name: 'name',
  normalizedName: 'normalizedName',
  extension: 'extension',
  type: 'type',
  language: 'language',
  mime: 'mime',
  size: 'size',
  description: 'description',
  tags: 'tags',
  previewAssetId: 'previewAssetId',
  previewStatus: 'previewStatus',
  uploadedBy: 'uploadedBy',
  version: 'version',
  deletedAt: 'deletedAt',
  deletedBy: 'deletedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BoardScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  name: 'name',
  normalizedName: 'normalizedName',
  description: 'description',
  review: 'review',
  contribution: 'contribution',
  createdBy: 'createdBy',
  archivedAt: 'archivedAt',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskScalarFieldEnum = {
  id: 'id',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  columnId: 'columnId',
  columnKind: 'columnKind',
  position: 'position',
  title: 'title',
  normalizedTitle: 'normalizedTitle',
  description: 'description',
  assigneeIds: 'assigneeIds',
  labelIds: 'labelIds',
  startDate: 'startDate',
  dueDate: 'dueDate',
  storyPoints: 'storyPoints',
  checklistDone: 'checklistDone',
  checklistTotal: 'checklistTotal',
  attachmentCount: 'attachmentCount',
  commentCount: 'commentCount',
  reviewState: 'reviewState',
  completedAt: 'completedAt',
  completionCount: 'completionCount',
  createdBy: 'createdBy',
  clientTaskId: 'clientTaskId',
  dueVersion: 'dueVersion',
  deletedFromColumnId: 'deletedFromColumnId',
  deletedAt: 'deletedAt',
  deletedBy: 'deletedBy',
  blockedByCount: 'blockedByCount',
  blockingCount: 'blockingCount',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LabelScalarFieldEnum = {
  id: 'id',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  name: 'name',
  normalizedName: 'normalizedName',
  color: 'color',
  createdAt: 'createdAt'
};

exports.Prisma.TaskActivityScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  actorId: 'actorId',
  type: 'type',
  before: 'before',
  after: 'after',
  groupKey: 'groupKey',
  at: 'at'
};

exports.Prisma.TaskDependencyScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  boardId: 'boardId',
  predecessorId: 'predecessorId',
  successorId: 'successorId',
  type: 'type',
  createdBy: 'createdBy',
  createdAt: 'createdAt'
};

exports.Prisma.RescheduleBatchScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  boardId: 'boardId',
  sourceTaskId: 'sourceTaskId',
  requestedBy: 'requestedBy',
  sourceDueDate: 'sourceDueDate',
  activeKey: 'activeKey',
  status: 'status',
  affectedCount: 'affectedCount',
  cursor: 'cursor',
  appliedCount: 'appliedCount',
  conflictCount: 'conflictCount',
  error: 'error',
  createdAt: 'createdAt',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt'
};

exports.Prisma.TaskCommentScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  authorId: 'authorId',
  clientCommentId: 'clientCommentId',
  content: 'content',
  mentions: 'mentions',
  attachmentCount: 'attachmentCount',
  editedAt: 'editedAt',
  deletedAt: 'deletedAt',
  deletedBy: 'deletedBy',
  deleteReason: 'deleteReason',
  version: 'version',
  createdAt: 'createdAt'
};

exports.Prisma.TaskWatcherScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  userId: 'userId',
  state: 'state',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskReviewRoundScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  round: 'round',
  status: 'status',
  activeKey: 'activeKey',
  requiredReviews: 'requiredReviews',
  configuredReviews: 'configuredReviews',
  assignedCount: 'assignedCount',
  approvedCount: 'approvedCount',
  shortage: 'shortage',
  autoApproved: 'autoApproved',
  openedBy: 'openedBy',
  openedAt: 'openedAt',
  closedAt: 'closedAt',
  closeReason: 'closeReason',
  waivedBy: 'waivedBy',
  waiveReason: 'waiveReason',
  version: 'version'
};

exports.Prisma.TaskReviewScalarFieldEnum = {
  id: 'id',
  roundId: 'roundId',
  taskId: 'taskId',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  reviewerId: 'reviewerId',
  status: 'status',
  assignedBy: 'assignedBy',
  assignedAt: 'assignedAt',
  submittedAt: 'submittedAt',
  score10: 'score10',
  feedback: 'feedback',
  cancelReason: 'cancelReason',
  replacedById: 'replacedById',
  version: 'version'
};

exports.Prisma.WorkspaceInvitationScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  email: 'email',
  normalizedEmail: 'normalizedEmail',
  role: 'role',
  guestChannelIds: 'guestChannelIds',
  guestDays: 'guestDays',
  message: 'message',
  tokenHash: 'tokenHash',
  invitedBy: 'invitedBy',
  status: 'status',
  pendingKey: 'pendingKey',
  expiresAt: 'expiresAt',
  lastSentAt: 'lastSentAt',
  sendCount: 'sendCount',
  acceptedBy: 'acceptedBy',
  acceptedAt: 'acceptedAt',
  revokedBy: 'revokedBy',
  revokedAt: 'revokedAt',
  createdAt: 'createdAt'
};

exports.Prisma.WorkspaceWalletScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  currency: 'currency',
  enabled: 'enabled',
  reminderEnabled: 'reminderEnabled',
  reminderCron: 'reminderCron',
  timezone: 'timezone',
  reminderTargetType: 'reminderTargetType',
  reminderTargetId: 'reminderTargetId',
  reminderMinDebt: 'reminderMinDebt',
  lastRemindedAt: 'lastRemindedAt',
  lastManualRemindAt: 'lastManualRemindAt',
  walletVersion: 'walletVersion',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkspaceExpenseScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  kind: 'kind',
  adjustsExpenseId: 'adjustsExpenseId',
  amount: 'amount',
  description: 'description',
  normalizedDescription: 'normalizedDescription',
  category: 'category',
  paidBy: 'paidBy',
  splitType: 'splitType',
  receiptAssetId: 'receiptAssetId',
  occurredAt: 'occurredAt',
  createdBy: 'createdBy',
  version: 'version',
  deletedAt: 'deletedAt',
  deletedBy: 'deletedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ExpenseShareScalarFieldEnum = {
  id: 'id',
  expenseId: 'expenseId',
  workspaceId: 'workspaceId',
  debtorId: 'debtorId',
  creditorId: 'creditorId',
  amount: 'amount',
  paidAmount: 'paidAmount',
  status: 'status',
  occurredAt: 'occurredAt'
};

exports.Prisma.SettlementScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  code: 'code',
  fromId: 'fromId',
  toId: 'toId',
  amount: 'amount',
  method: 'method',
  proofAssetId: 'proofAssetId',
  note: 'note',
  status: 'status',
  createdBy: 'createdBy',
  confirmedAt: 'confirmedAt',
  rejectedAt: 'rejectedAt',
  rejectReason: 'rejectReason',
  cancelledAt: 'cancelledAt',
  staleNotifiedAt: 'staleNotifiedAt',
  version: 'version',
  createdAt: 'createdAt'
};

exports.Prisma.WalletBalanceScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  userId: 'userId',
  balance: 'balance',
  owedTotal: 'owedTotal',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserPaymentProfileScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  bankBin: 'bankBin',
  accountNumberEnc: 'accountNumberEnc',
  accountLast4: 'accountLast4',
  accountName: 'accountName',
  isDefault: 'isDefault',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StudySetScalarFieldEnum = {
  id: 'id',
  ownerId: 'ownerId',
  workspaceId: 'workspaceId',
  title: 'title',
  normalizedTitle: 'normalizedTitle',
  description: 'description',
  tags: 'tags',
  coverAssetId: 'coverAssetId',
  language: 'language',
  visibility: 'visibility',
  status: 'status',
  hiddenReason: 'hiddenReason',
  hiddenBy: 'hiddenBy',
  hiddenAt: 'hiddenAt',
  itemCount: 'itemCount',
  itemTypesMask: 'itemTypesMask',
  reportedCount: 'reportedCount',
  copiedFromId: 'copiedFromId',
  copyCount: 'copyCount',
  version: 'version',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StudyItemScalarFieldEnum = {
  id: 'id',
  setId: 'setId',
  ownerId: 'ownerId',
  type: 'type',
  prompt: 'prompt',
  answerText: 'answerText',
  correctOptionIds: 'correctOptionIds',
  acceptedAnswers: 'acceptedAnswers',
  matchMode: 'matchMode',
  explanation: 'explanation',
  frontMediaAssetId: 'frontMediaAssetId',
  backMediaAssetId: 'backMediaAssetId',
  audioAssetId: 'audioAssetId',
  tags: 'tags',
  order: 'order',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WebhookEventScalarFieldEnum = {
  id: 'id',
  provider: 'provider',
  eventId: 'eventId',
  type: 'type',
  roomName: 'roomName',
  payloadHash: 'payloadHash',
  payload: 'payload',
  status: 'status',
  error: 'error',
  attempts: 'attempts',
  receivedAt: 'receivedAt',
  processedAt: 'processedAt'
};

exports.Prisma.CallScalarFieldEnum = {
  id: 'id',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  workspaceId: 'workspaceId',
  mode: 'mode',
  mediaKind: 'mediaKind',
  status: 'status',
  endReason: 'endReason',
  initiatorId: 'initiatorId',
  hostId: 'hostId',
  livekitRoom: 'livekitRoom',
  clientCallId: 'clientCallId',
  activeKey: 'activeKey',
  invitedCount: 'invitedCount',
  peakParticipants: 'peakParticipants',
  startedAt: 'startedAt',
  answeredAt: 'answeredAt',
  endedAt: 'endedAt',
  durationSec: 'durationSec',
  endedBy: 'endedBy',
  lastReconciledAt: 'lastReconciledAt',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CallParticipantScalarFieldEnum = {
  id: 'id',
  callId: 'callId',
  userId: 'userId',
  role: 'role',
  state: 'state',
  invitedAt: 'invitedAt',
  invitedBy: 'invitedBy',
  joiningAt: 'joiningAt',
  respondedAt: 'respondedAt',
  respondedDeviceId: 'respondedDeviceId',
  firstJoinedAt: 'firstJoinedAt',
  lastJoinedAt: 'lastJoinedAt',
  lastLeftAt: 'lastLeftAt',
  connectedSeconds: 'connectedSeconds',
  handRaisedAt: 'handRaisedAt',
  mutedByHost: 'mutedByHost',
  removedBy: 'removedBy',
  callStartedAt: 'callStartedAt',
  scopeType: 'scopeType',
  scopeId: 'scopeId',
  mediaKind: 'mediaKind',
  mode: 'mode',
  outcome: 'outcome',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MeetingScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  code: 'code',
  title: 'title',
  normalizedTitle: 'normalizedTitle',
  agenda: 'agenda',
  format: 'format',
  location: 'location',
  platform: 'platform',
  externalUrl: 'externalUrl',
  startAt: 'startAt',
  endAt: 'endAt',
  timezone: 'timezone',
  seriesId: 'seriesId',
  occurrenceIndex: 'occurrenceIndex',
  isSeriesException: 'isSeriesException',
  status: 'status',
  hostId: 'hostId',
  visibility: 'visibility',
  lobbyMode: 'lobbyMode',
  joinWindowMinutes: 'joinWindowMinutes',
  reminderMinutes: 'reminderMinutes',
  notifyVia: 'notifyVia',
  recapRequired: 'recapRequired',
  recordingAllowed: 'recordingAllowed',
  createChatGroup: 'createChatGroup',
  conversationId: 'conversationId',
  currentCallId: 'currentCallId',
  lockedAt: 'lockedAt',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  endReason: 'endReason',
  cancelledAt: 'cancelledAt',
  cancelledBy: 'cancelledBy',
  cancelReason: 'cancelReason',
  deletedAt: 'deletedAt',
  deletedBy: 'deletedBy',
  attendeeCount: 'attendeeCount',
  createdBy: 'createdBy',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MeetingAttendeeScalarFieldEnum = {
  id: 'id',
  meetingId: 'meetingId',
  workspaceId: 'workspaceId',
  userId: 'userId',
  role: 'role',
  rsvp: 'rsvp',
  rsvpAt: 'rsvpAt',
  source: 'source',
  invitedBy: 'invitedBy',
  invitedAt: 'invitedAt',
  removedAt: 'removedAt',
  removedBy: 'removedBy',
  firstJoinedAt: 'firstJoinedAt',
  attendedSeconds: 'attendedSeconds',
  meetingStartAt: 'meetingStartAt',
  meetingEndAt: 'meetingEndAt',
  meetingStatus: 'meetingStatus',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MeetingSeriesScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  hostId: 'hostId',
  rule: 'rule',
  timezone: 'timezone',
  localStartTime: 'localStartTime',
  durationMinutes: 'durationMinutes',
  template: 'template',
  attendeeIds: 'attendeeIds',
  coHostIds: 'coHostIds',
  materializedUntil: 'materializedUntil',
  status: 'status',
  createdBy: 'createdBy',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MockAttemptScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  setId: 'setId',
  setTitle: 'setTitle',
  setVersion: 'setVersion',
  status: 'status',
  activeKey: 'activeKey',
  startedAt: 'startedAt',
  expiresAt: 'expiresAt',
  submittedAt: 'submittedAt',
  submitMode: 'submitMode',
  answeredCount: 'answeredCount',
  correctCount: 'correctCount',
  scorePct: 'scorePct',
  passed: 'passed',
  backgroundCount: 'backgroundCount',
  backgroundMs: 'backgroundMs',
  lastBackgroundAt: 'lastBackgroundAt',
  eventCount: 'eventCount',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MockAnswerScalarFieldEnum = {
  id: 'id',
  attemptId: 'attemptId',
  userId: 'userId',
  itemId: 'itemId',
  optionIds: 'optionIds',
  text: 'text',
  timeMs: 'timeMs',
  correct: 'correct',
  partial: 'partial',
  answeredAt: 'answeredAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SrEnrollmentScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  setId: 'setId',
  active: 'active',
  newPerDay: 'newPerDay',
  syncedVersion: 'syncedVersion',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SrProgressScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  itemId: 'itemId',
  setId: 'setId',
  status: 'status',
  source: 'source',
  easiness: 'easiness',
  interval: 'interval',
  repetition: 'repetition',
  lapses: 'lapses',
  nextReviewAt: 'nextReviewAt',
  lastRating: 'lastRating',
  lastReviewedAt: 'lastReviewedAt',
  itemOrder: 'itemOrder',
  suspendedReason: 'suspendedReason',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SrReviewLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  itemId: 'itemId',
  setId: 'setId',
  clientReviewId: 'clientReviewId',
  rating: 'rating',
  grade: 'grade',
  prevInterval: 'prevInterval',
  newInterval: 'newInterval',
  localDate: 'localDate',
  reviewedAt: 'reviewedAt'
};

exports.Prisma.XpRuleScalarFieldEnum = {
  id: 'id',
  sourceType: 'sourceType',
  xp: 'xp',
  dailyCap: 'dailyCap',
  countsForStreak: 'countsForStreak',
  isActive: 'isActive',
  version: 'version',
  updatedBy: 'updatedBy',
  updatedAt: 'updatedAt'
};

exports.Prisma.XpEventScalarFieldEnum = {
  id: 'id',
  dedupeKey: 'dedupeKey',
  userId: 'userId',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  workspaceId: 'workspaceId',
  xp: 'xp',
  capped: 'capped',
  blockedReason: 'blockedReason',
  localDate: 'localDate',
  occurredAt: 'occurredAt',
  actorId: 'actorId',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.XpDailyTotalScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  sourceType: 'sourceType',
  localDate: 'localDate',
  xp: 'xp'
};

exports.Prisma.UserGamificationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  xp: 'xp',
  level: 'level',
  streak: 'streak',
  lastActiveDate: 'lastActiveDate',
  streakTz: 'streakTz',
  showcaseBadgeIds: 'showcaseBadgeIds',
  levelUpSeenLevel: 'levelUpSeenLevel',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BadgeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  description: 'description',
  emoji: 'emoji',
  iconAssetId: 'iconAssetId',
  criteria: 'criteria',
  counters: 'counters',
  rarity: 'rarity',
  isActive: 'isActive',
  order: 'order',
  version: 'version',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserBadgeScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  badgeId: 'badgeId',
  unlockedAt: 'unlockedAt',
  seenAt: 'seenAt',
  via: 'via',
  revokedAt: 'revokedAt',
  revokedBy: 'revokedBy',
  revokeReason: 'revokeReason'
};

exports.Prisma.LiveQuizSessionScalarFieldEnum = {
  id: 'id',
  setId: 'setId',
  setTitle: 'setTitle',
  workspaceId: 'workspaceId',
  hostId: 'hostId',
  pin: 'pin',
  status: 'status',
  questionOrder: 'questionOrder',
  currentIndex: 'currentIndex',
  questionStartedAt: 'questionStartedAt',
  deadlineAt: 'deadlineAt',
  secondsPerQuestion: 'secondsPerQuestion',
  revealSeconds: 'revealSeconds',
  autoAdvance: 'autoAdvance',
  scoring: 'scoring',
  playersCount: 'playersCount',
  version: 'version',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  endReason: 'endReason',
  resultsPersistedAt: 'resultsPersistedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LiveQuizResultScalarFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  userId: 'userId',
  nickname: 'nickname',
  score: 'score',
  correct: 'correct',
  answered: 'answered',
  rank: 'rank',
  answers: 'answers',
  createdAt: 'createdAt'
};

exports.Prisma.WorkspaceTemplateScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  description: 'description',
  channels: 'channels',
  isActive: 'isActive',
  order: 'order',
  version: 'version',
  updatedBy: 'updatedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkspaceTemplateApplicationScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  templateCode: 'templateCode',
  channelKeys: 'channelKeys',
  createdChannelIds: 'createdChannelIds',
  skippedKeys: 'skippedKeys',
  appliedBy: 'appliedBy',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt'
};

exports.Prisma.AnnouncementRequestScalarFieldEnum = {
  id: 'id',
  messageId: 'messageId',
  channelId: 'channelId',
  workspaceId: 'workspaceId',
  requestedBy: 'requestedBy',
  deadlineAt: 'deadlineAt',
  confirmedCount: 'confirmedCount',
  cancelledAt: 'cancelledAt',
  cancelledBy: 'cancelledBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AnnouncementReceiptScalarFieldEnum = {
  id: 'id',
  requestId: 'requestId',
  userId: 'userId',
  confirmedAt: 'confirmedAt'
};

exports.Prisma.ContributionTaskFactScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  assigneeIds: 'assigneeIds',
  storyPoints: 'storyPoints',
  dueDate: 'dueDate',
  completedAt: 'completedAt',
  completionCount: 'completionCount',
  active: 'active',
  reviewApproved: 'reviewApproved',
  updatedAt: 'updatedAt'
};

exports.Prisma.ContributionReviewFactScalarFieldEnum = {
  id: 'id',
  reviewId: 'reviewId',
  taskId: 'taskId',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  reviewerId: 'reviewerId',
  assigneeIds: 'assigneeIds',
  status: 'status',
  score10: 'score10',
  submittedAt: 'submittedAt'
};

exports.Prisma.ContributionSnapshotScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  boardId: 'boardId',
  userId: 'userId',
  periodKey: 'periodKey',
  storyPointsDone: 'storyPointsDone',
  tasksDone: 'tasksDone',
  unestimatedTasks: 'unestimatedTasks',
  tasksWithDue: 'tasksWithDue',
  tasksOnTime: 'tasksOnTime',
  tasksLate: 'tasksLate',
  reviewCount: 'reviewCount',
  peerScoreAvg: 'peerScoreAvg',
  components: 'components',
  score: 'score',
  share: 'share',
  weightsUsed: 'weightsUsed',
  teamTasksDone: 'teamTasksDone',
  teamStoryPoints: 'teamStoryPoints',
  formulaVersion: 'formulaVersion',
  computedAt: 'computedAt'
};

exports.Prisma.ContributionBoardStateScalarFieldEnum = {
  id: 'id',
  boardId: 'boardId',
  workspaceId: 'workspaceId',
  factsVersion: 'factsVersion',
  computedVersion: 'computedVersion',
  computedAt: 'computedAt',
  configVersion: 'configVersion',
  configChangedAt: 'configChangedAt',
  configChangedBy: 'configChangedBy',
  previousWeights: 'previousWeights',
  defaultsSnapshot: 'defaultsSnapshot',
  activityDirtyAt: 'activityDirtyAt',
  activityRefreshedAt: 'activityRefreshedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ActivityDailyScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  boardId: 'boardId',
  userId: 'userId',
  date: 'date',
  taskEvents: 'taskEvents',
  checklistEvents: 'checklistEvents',
  commentEvents: 'commentEvents',
  reviewEvents: 'reviewEvents',
  total: 'total',
  updatedAt: 'updatedAt'
};

exports.Prisma.ContributionExportScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  boardId: 'boardId',
  requestedBy: 'requestedBy',
  periodKey: 'periodKey',
  includeHeatmap: 'includeHeatmap',
  status: 'status',
  dedupeKey: 'dedupeKey',
  dataHash: 'dataHash',
  verifyCode: 'verifyCode',
  weights: 'weights',
  memberCount: 'memberCount',
  assetId: 'assetId',
  error: 'error',
  createdAt: 'createdAt',
  readyAt: 'readyAt',
  expiresAt: 'expiresAt'
};

exports.Prisma.PomodoroSessionScalarFieldEnum = {
  id: 'id',
  channelId: 'channelId',
  workspaceId: 'workspaceId',
  callId: 'callId',
  hostUserId: 'hostUserId',
  config: 'config',
  phase: 'phase',
  previousPhase: 'previousPhase',
  phaseStartedAt: 'phaseStartedAt',
  phaseEndsAt: 'phaseEndsAt',
  remainingMs: 'remainingMs',
  completedFocusCycles: 'completedFocusCycles',
  skippedFocusCycles: 'skippedFocusCycles',
  pauseReason: 'pauseReason',
  activeKey: 'activeKey',
  version: 'version',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  endReason: 'endReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PomodoroPresenceScalarFieldEnum = {
  id: 'id',
  sessionId: 'sessionId',
  userId: 'userId',
  joinedAt: 'joinedAt',
  leftAt: 'leftAt',
  presentSeconds: 'presentSeconds',
  cyclesAttended: 'cyclesAttended',
  interruptions: 'interruptions',
  goal: 'goal',
  goalShared: 'goalShared',
  updatedAt: 'updatedAt'
};

exports.Prisma.MeetingRecapScalarFieldEnum = {
  id: 'id',
  meetingId: 'meetingId',
  workspaceId: 'workspaceId',
  content: 'content',
  publishedContent: 'publishedContent',
  publishedAssetIds: 'publishedAssetIds',
  startedAt: 'startedAt',
  endedAt: 'endedAt',
  authorId: 'authorId',
  lastEditedBy: 'lastEditedBy',
  publishedAt: 'publishedAt',
  publishedBy: 'publishedBy',
  publishedVersion: 'publishedVersion',
  systemMessageId: 'systemMessageId',
  attachmentCount: 'attachmentCount',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MeetingRecordingScalarFieldEnum = {
  id: 'id',
  meetingId: 'meetingId',
  workspaceId: 'workspaceId',
  callId: 'callId',
  requestId: 'requestId',
  egressId: 'egressId',
  layout: 'layout',
  status: 'status',
  storageKey: 'storageKey',
  assetId: 'assetId',
  fileSizeBytes: 'fileSizeBytes',
  startedBy: 'startedBy',
  startedAt: 'startedAt',
  stoppedAt: 'stoppedAt',
  stoppedBy: 'stoppedBy',
  stopReason: 'stopReason',
  durationSec: 'durationSec',
  error: 'error',
  importAttempts: 'importAttempts',
  retentionExpiresAt: 'retentionExpiresAt',
  deletedAt: 'deletedAt',
  deletedBy: 'deletedBy',
  deleteReason: 'deleteReason',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};
exports.UserStatus = exports.$Enums.UserStatus = {
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  PENDING_DELETION: 'PENDING_DELETION',
  ANONYMIZED: 'ANONYMIZED'
};

exports.SessionAuthMethod = exports.$Enums.SessionAuthMethod = {
  PASSWORD: 'PASSWORD',
  BIOMETRIC: 'BIOMETRIC'
};

exports.DevicePlatform = exports.$Enums.DevicePlatform = {
  ANDROID: 'ANDROID',
  IOS: 'IOS',
  WEB: 'WEB'
};

exports.BiometricKind = exports.$Enums.BiometricKind = {
  FACE: 'FACE',
  FINGERPRINT: 'FINGERPRINT',
  IRIS: 'IRIS',
  GENERIC: 'GENERIC'
};

exports.BiometricCredentialStatus = exports.$Enums.BiometricCredentialStatus = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED'
};

exports.AssetScope = exports.$Enums.AssetScope = {
  MESSAGE: 'MESSAGE',
  RESOURCE: 'RESOURCE',
  AVATAR: 'AVATAR',
  TASK: 'TASK',
  TASK_COMMENT: 'TASK_COMMENT',
  DOC: 'DOC',
  PRINT: 'PRINT',
  WORKSPACE: 'WORKSPACE',
  MEETING: 'MEETING',
  RECORDING: 'RECORDING',
  STUDY: 'STUDY',
  REPORT: 'REPORT'
};

exports.AssetKind = exports.$Enums.AssetKind = {
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  VOICE: 'VOICE',
  FILE: 'FILE'
};

exports.AssetVariant = exports.$Enums.AssetVariant = {
  ORIGINAL: 'ORIGINAL',
  THUMB: 'THUMB',
  POSTER: 'POSTER'
};

exports.AssetStatus = exports.$Enums.AssetStatus = {
  UPLOADING: 'UPLOADING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  REJECTED: 'REJECTED',
  DELETED: 'DELETED'
};

exports.UploadMethod = exports.$Enums.UploadMethod = {
  PRESIGNED_PUT: 'PRESIGNED_PUT',
  API_PUT: 'API_PUT'
};

exports.AssetLinkTarget = exports.$Enums.AssetLinkTarget = {
  MESSAGE: 'MESSAGE',
  USER_AVATAR: 'USER_AVATAR',
  WORKSPACE_AVATAR: 'WORKSPACE_AVATAR',
  CONVERSATION_AVATAR: 'CONVERSATION_AVATAR',
  MEETING_RECAP: 'MEETING_RECAP',
  MEETING_RECORDING: 'MEETING_RECORDING',
  TASK: 'TASK',
  TASK_COMMENT: 'TASK_COMMENT',
  RESOURCE: 'RESOURCE',
  DOCUMENT: 'DOCUMENT',
  EXPENSE_RECEIPT: 'EXPENSE_RECEIPT',
  SETTLEMENT_PROOF: 'SETTLEMENT_PROOF',
  STUDY_ITEM: 'STUDY_ITEM',
  STUDY_SET_COVER: 'STUDY_SET_COVER',
  CONTRIBUTION_EXPORT: 'CONTRIBUTION_EXPORT',
  OTHER: 'OTHER'
};

exports.AssetLinkScope = exports.$Enums.AssetLinkScope = {
  WORKSPACE: 'WORKSPACE',
  CHANNEL: 'CHANNEL',
  CONVERSATION: 'CONVERSATION',
  MEETING: 'MEETING',
  USER: 'USER',
  NONE: 'NONE'
};

exports.NotificationScopeType = exports.$Enums.NotificationScopeType = {
  NONE: 'NONE',
  WORKSPACE: 'WORKSPACE',
  CHANNEL: 'CHANNEL',
  CONVERSATION: 'CONVERSATION',
  MEETING: 'MEETING',
  CALL: 'CALL'
};

exports.NotificationPushStatus = exports.$Enums.NotificationPushStatus = {
  NONE: 'NONE',
  PENDING: 'PENDING',
  SENT: 'SENT',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED'
};

exports.PreferenceScope = exports.$Enums.PreferenceScope = {
  ACCOUNT: 'ACCOUNT',
  WORKSPACE: 'WORKSPACE',
  CHANNEL: 'CHANNEL',
  CONVERSATION: 'CONVERSATION'
};

exports.PreferenceMode = exports.$Enums.PreferenceMode = {
  INHERIT: 'INHERIT',
  ALL: 'ALL',
  MENTIONS: 'MENTIONS',
  MUTED: 'MUTED'
};

exports.NotifyModeAccount = exports.$Enums.NotifyModeAccount = {
  ALL: 'ALL',
  MENTIONS_AND_THREADS: 'MENTIONS_AND_THREADS',
  MUTED: 'MUTED'
};

exports.LockScreenPreview = exports.$Enums.LockScreenPreview = {
  HIDDEN: 'HIDDEN',
  SENDER: 'SENDER',
  FULL: 'FULL'
};

exports.ReadStreamType = exports.$Enums.ReadStreamType = {
  CHANNEL: 'CHANNEL',
  THREAD: 'THREAD'
};

exports.WorkspaceRole = exports.$Enums.WorkspaceRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  GUEST: 'GUEST'
};

exports.MembershipStatus = exports.$Enums.MembershipStatus = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  LEFT: 'LEFT',
  REMOVED: 'REMOVED',
  BANNED: 'BANNED'
};

exports.NotifyMode = exports.$Enums.NotifyMode = {
  INHERIT: 'INHERIT',
  ALL_MESSAGES: 'ALL_MESSAGES',
  MENTIONS_AND_THREADS: 'MENTIONS_AND_THREADS',
  MUTED: 'MUTED'
};

exports.GrantLevel = exports.$Enums.GrantLevel = {
  MEMBER: 'MEMBER',
  MANAGER: 'MANAGER'
};

exports.GrantSource = exports.$Enums.GrantSource = {
  DIRECT: 'DIRECT',
  ROLE: 'ROLE'
};

exports.WorkspaceStatus = exports.$Enums.WorkspaceStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED'
};

exports.WorkspaceArchiveReason = exports.$Enums.WorkspaceArchiveReason = {
  MANUAL: 'MANUAL',
  PLATFORM: 'PLATFORM'
};

exports.JoinPolicy = exports.$Enums.JoinPolicy = {
  OPEN: 'OPEN',
  APPROVAL: 'APPROVAL'
};

exports.ChannelType = exports.$Enums.ChannelType = {
  TEXT: 'TEXT',
  VOICE: 'VOICE',
  POMODORO: 'POMODORO'
};

exports.ChannelVisibility = exports.$Enums.ChannelVisibility = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE'
};

exports.PostingPolicy = exports.$Enums.PostingPolicy = {
  MEMBERS: 'MEMBERS',
  ADMINS_ONLY: 'ADMINS_ONLY'
};

exports.ChannelStatus = exports.$Enums.ChannelStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED'
};

exports.ChannelArchiveReason = exports.$Enums.ChannelArchiveReason = {
  MANUAL: 'MANUAL',
  NO_MANAGER: 'NO_MANAGER',
  PLATFORM: 'PLATFORM'
};

exports.MessageScopeType = exports.$Enums.MessageScopeType = {
  CHANNEL: 'CHANNEL',
  CONVERSATION: 'CONVERSATION'
};

exports.MessageKind = exports.$Enums.MessageKind = {
  USER: 'USER',
  SYSTEM: 'SYSTEM'
};

exports.SystemMessageType = exports.$Enums.SystemMessageType = {
  CONVERSATION_CREATED: 'CONVERSATION_CREATED',
  MEMBER_JOINED: 'MEMBER_JOINED',
  MEMBER_LEFT: 'MEMBER_LEFT',
  MEMBER_ADDED: 'MEMBER_ADDED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  OWNER_TRANSFERRED: 'OWNER_TRANSFERRED',
  TITLE_CHANGED: 'TITLE_CHANGED',
  AVATAR_CHANGED: 'AVATAR_CHANGED',
  MESSAGE_PINNED: 'MESSAGE_PINNED',
  CALL_SUMMARY: 'CALL_SUMMARY',
  MEETING_REMINDER: 'MEETING_REMINDER',
  MEETING_STARTED: 'MEETING_STARTED',
  MEETING_RECAP: 'MEETING_RECAP',
  MEETING_RECORDING_READY: 'MEETING_RECORDING_READY',
  INTEGRATION: 'INTEGRATION',
  CONVERSATION_DISSOLVED: 'CONVERSATION_DISSOLVED',
  WALLET_REMINDER: 'WALLET_REMINDER'
};

exports.DeviceTokenKind = exports.$Enums.DeviceTokenKind = {
  FCM: 'FCM',
  APNS_VOIP: 'APNS_VOIP'
};

exports.ApnsEnvironment = exports.$Enums.ApnsEnvironment = {
  SANDBOX: 'SANDBOX',
  PRODUCTION: 'PRODUCTION'
};

exports.OutboxStatus = exports.$Enums.OutboxStatus = {
  PENDING: 'PENDING',
  DISPATCHING: 'DISPATCHING',
  DISPATCHED: 'DISPATCHED',
  FAILED: 'FAILED'
};

exports.ReportTargetType = exports.$Enums.ReportTargetType = {
  MESSAGE: 'MESSAGE',
  USER: 'USER',
  CHANNEL: 'CHANNEL',
  CONVERSATION: 'CONVERSATION',
  STUDY_SET: 'STUDY_SET'
};

exports.ReportHandlerLevel = exports.$Enums.ReportHandlerLevel = {
  SCOPE: 'SCOPE',
  PLATFORM_ONLY: 'PLATFORM_ONLY'
};

exports.ReportReason = exports.$Enums.ReportReason = {
  SPAM: 'SPAM',
  HARASSMENT: 'HARASSMENT',
  INAPPROPRIATE: 'INAPPROPRIATE',
  SCAM: 'SCAM',
  IMPERSONATION: 'IMPERSONATION',
  OTHER: 'OTHER',
  COPYRIGHT: 'COPYRIGHT',
  WRONG_CONTENT: 'WRONG_CONTENT'
};

exports.ReportStatus = exports.$Enums.ReportStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED'
};

exports.ReportResolution = exports.$Enums.ReportResolution = {
  CONTENT_REMOVED: 'CONTENT_REMOVED',
  AUTHOR_WARNED: 'AUTHOR_WARNED',
  USER_LOCKED: 'USER_LOCKED',
  CHANNEL_ARCHIVED: 'CHANNEL_ARCHIVED',
  CONVERSATION_DISSOLVED: 'CONVERSATION_DISSOLVED',
  NO_ACTION: 'NO_ACTION'
};

exports.ConversationKind = exports.$Enums.ConversationKind = {
  DIRECT: 'DIRECT',
  GROUP: 'GROUP'
};

exports.ConversationStatus = exports.$Enums.ConversationStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DISSOLVED: 'DISSOLVED'
};

exports.ConversationRole = exports.$Enums.ConversationRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER'
};

exports.ConversationMemberStatus = exports.$Enums.ConversationMemberStatus = {
  ACTIVE: 'ACTIVE',
  LEFT: 'LEFT',
  REMOVED: 'REMOVED'
};

exports.ConversationNotifyMode = exports.$Enums.ConversationNotifyMode = {
  INHERIT: 'INHERIT',
  ALL: 'ALL',
  MENTIONS: 'MENTIONS',
  MUTED: 'MUTED'
};

exports.ThreadSubscriptionState = exports.$Enums.ThreadSubscriptionState = {
  AUTO_ON: 'AUTO_ON',
  EXPLICIT_ON: 'EXPLICIT_ON',
  EXPLICIT_OFF: 'EXPLICIT_OFF'
};

exports.ResourceType = exports.$Enums.ResourceType = {
  PDF: 'PDF',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  CODE: 'CODE',
  DOC: 'DOC',
  SHEET: 'SHEET',
  SLIDE: 'SLIDE',
  TEXT: 'TEXT',
  OTHER: 'OTHER'
};

exports.PreviewStatus = exports.$Enums.PreviewStatus = {
  NONE: 'NONE',
  NATIVE: 'NATIVE',
  PENDING: 'PENDING',
  READY: 'READY',
  FAILED: 'FAILED',
  UNSUPPORTED: 'UNSUPPORTED'
};

exports.ColumnKind = exports.$Enums.ColumnKind = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  DONE: 'DONE'
};

exports.ReviewState = exports.$Enums.ReviewState = {
  NONE: 'NONE',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED'
};

exports.DependencyType = exports.$Enums.DependencyType = {
  FINISH_TO_START: 'FINISH_TO_START'
};

exports.RescheduleBatchStatus = exports.$Enums.RescheduleBatchStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED'
};

exports.ReviewRoundStatus = exports.$Enums.ReviewRoundStatus = {
  OPEN: 'OPEN',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  CANCELLED: 'CANCELLED',
  WAIVED: 'WAIVED'
};

exports.TaskReviewStatus = exports.$Enums.TaskReviewStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
  CANCELLED: 'CANCELLED',
  REASSIGNED: 'REASSIGNED'
};

exports.InvitationStatus = exports.$Enums.InvitationStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED'
};

exports.WalletReminderTarget = exports.$Enums.WalletReminderTarget = {
  NONE: 'NONE',
  CONVERSATION: 'CONVERSATION',
  CHANNEL: 'CHANNEL'
};

exports.ExpenseKind = exports.$Enums.ExpenseKind = {
  EXPENSE: 'EXPENSE',
  ADJUSTMENT: 'ADJUSTMENT'
};

exports.SplitType = exports.$Enums.SplitType = {
  EQUAL: 'EQUAL',
  CUSTOM: 'CUSTOM',
  PERCENT: 'PERCENT'
};

exports.ShareStatus = exports.$Enums.ShareStatus = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  VOID: 'VOID'
};

exports.SettlementMethod = exports.$Enums.SettlementMethod = {
  CASH: 'CASH',
  BANK: 'BANK',
  OTHER: 'OTHER'
};

exports.SettlementStatus = exports.$Enums.SettlementStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

exports.StudyVisibility = exports.$Enums.StudyVisibility = {
  PRIVATE: 'PRIVATE',
  WORKSPACE: 'WORKSPACE',
  PUBLIC: 'PUBLIC'
};

exports.StudySetStatus = exports.$Enums.StudySetStatus = {
  ACTIVE: 'ACTIVE',
  HIDDEN: 'HIDDEN',
  DELETED: 'DELETED'
};

exports.StudyItemType = exports.$Enums.StudyItemType = {
  FLASHCARD: 'FLASHCARD',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  MULTI_SELECT: 'MULTI_SELECT',
  TRUE_FALSE: 'TRUE_FALSE',
  FILL_BLANK: 'FILL_BLANK'
};

exports.FillMatchMode = exports.$Enums.FillMatchMode = {
  EXACT: 'EXACT',
  IGNORE_CASE: 'IGNORE_CASE',
  IGNORE_ACCENTS: 'IGNORE_ACCENTS'
};

exports.WebhookProvider = exports.$Enums.WebhookProvider = {
  LIVEKIT: 'LIVEKIT',
  GITHUB: 'GITHUB',
  GITLAB: 'GITLAB',
  GOOGLE: 'GOOGLE',
  FIGMA: 'FIGMA'
};

exports.WebhookEventStatus = exports.$Enums.WebhookEventStatus = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
  IGNORED: 'IGNORED'
};

exports.CallScopeType = exports.$Enums.CallScopeType = {
  CONVERSATION: 'CONVERSATION',
  CHANNEL: 'CHANNEL',
  MEETING: 'MEETING'
};

exports.CallMode = exports.$Enums.CallMode = {
  RING: 'RING',
  ROOM: 'ROOM'
};

exports.CallMediaKind = exports.$Enums.CallMediaKind = {
  AUDIO: 'AUDIO',
  VIDEO: 'VIDEO'
};

exports.CallStatus = exports.$Enums.CallStatus = {
  RINGING: 'RINGING',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED'
};

exports.CallEndReason = exports.$Enums.CallEndReason = {
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_ANSWER: 'NO_ANSWER',
  DECLINED: 'DECLINED',
  BUSY: 'BUSY',
  FAILED: 'FAILED',
  REVOKED: 'REVOKED',
  ARCHIVED: 'ARCHIVED',
  HOST_ENDED: 'HOST_ENDED',
  FORCE_ENDED: 'FORCE_ENDED',
  EMPTY: 'EMPTY',
  MAX_DURATION: 'MAX_DURATION'
};

exports.CallParticipantRole = exports.$Enums.CallParticipantRole = {
  INITIATOR: 'INITIATOR',
  HOST: 'HOST',
  CO_HOST: 'CO_HOST',
  MEMBER: 'MEMBER'
};

exports.CallParticipantState = exports.$Enums.CallParticipantState = {
  INVITED: 'INVITED',
  RINGING: 'RINGING',
  DECLINED: 'DECLINED',
  MISSED: 'MISSED',
  BUSY: 'BUSY',
  JOINING: 'JOINING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  LEFT: 'LEFT',
  REMOVED: 'REMOVED'
};

exports.CallOutcome = exports.$Enums.CallOutcome = {
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
  DECLINED: 'DECLINED',
  BUSY: 'BUSY',
  CANCELLED: 'CANCELLED',
  NO_ANSWER: 'NO_ANSWER',
  OUTGOING_UNANSWERED: 'OUTGOING_UNANSWERED'
};

exports.MeetingFormat = exports.$Enums.MeetingFormat = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  HYBRID: 'HYBRID'
};

exports.MeetingPlatform = exports.$Enums.MeetingPlatform = {
  INTERNAL: 'INTERNAL',
  ZOOM: 'ZOOM',
  TEAMS: 'TEAMS',
  GOOGLE_MEET: 'GOOGLE_MEET',
  OTHER: 'OTHER'
};

exports.MeetingStatus = exports.$Enums.MeetingStatus = {
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED'
};

exports.MeetingVisibility = exports.$Enums.MeetingVisibility = {
  ATTENDEES: 'ATTENDEES',
  WORKSPACE: 'WORKSPACE'
};

exports.MeetingLobbyMode = exports.$Enums.MeetingLobbyMode = {
  OFF: 'OFF',
  NON_ATTENDEES: 'NON_ATTENDEES',
  ALL: 'ALL'
};

exports.MeetingNotifyVia = exports.$Enums.MeetingNotifyVia = {
  APP: 'APP',
  CHAT: 'CHAT',
  BOTH: 'BOTH'
};

exports.MeetingEndReason = exports.$Enums.MeetingEndReason = {
  HOST_ENDED: 'HOST_ENDED',
  EMPTY: 'EMPTY',
  MAX_DURATION: 'MAX_DURATION',
  FORCE_ENDED: 'FORCE_ENDED',
  WORKSPACE_ARCHIVED: 'WORKSPACE_ARCHIVED',
  HOST_REMOVED: 'HOST_REMOVED'
};

exports.MeetingAttendeeRole = exports.$Enums.MeetingAttendeeRole = {
  HOST: 'HOST',
  CO_HOST: 'CO_HOST',
  ATTENDEE: 'ATTENDEE'
};

exports.MeetingRsvp = exports.$Enums.MeetingRsvp = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  TENTATIVE: 'TENTATIVE'
};

exports.MeetingAttendeeSource = exports.$Enums.MeetingAttendeeSource = {
  INVITED: 'INVITED',
  JOINED_VIA_LINK: 'JOINED_VIA_LINK',
  SERIES: 'SERIES'
};

exports.MeetingSeriesStatus = exports.$Enums.MeetingSeriesStatus = {
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED'
};

exports.MockAttemptStatus = exports.$Enums.MockAttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  EXPIRED: 'EXPIRED'
};

exports.MockSubmitMode = exports.$Enums.MockSubmitMode = {
  MANUAL: 'MANUAL',
  AUTO: 'AUTO'
};

exports.SrStatus = exports.$Enums.SrStatus = {
  NEW: 'NEW',
  LEARNING: 'LEARNING',
  REVIEW: 'REVIEW',
  SUSPENDED: 'SUSPENDED'
};

exports.SrSource = exports.$Enums.SrSource = {
  ENROLL: 'ENROLL',
  MOCK_WRONG: 'MOCK_WRONG'
};

exports.SrRating = exports.$Enums.SrRating = {
  AGAIN: 'AGAIN',
  HARD: 'HARD',
  GOOD: 'GOOD',
  EASY: 'EASY'
};

exports.XpSourceType = exports.$Enums.XpSourceType = {
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_ON_TIME: 'TASK_ON_TIME',
  QUIZ_SCORED: 'QUIZ_SCORED',
  QUIZ_PASSED: 'QUIZ_PASSED',
  SR_REVIEW: 'SR_REVIEW',
  SR_REVIEW_DAY: 'SR_REVIEW_DAY',
  REVIEW_SUBMITTED: 'REVIEW_SUBMITTED',
  STUDY_SET_PUBLISHED: 'STUDY_SET_PUBLISHED',
  POMODORO_CYCLE: 'POMODORO_CYCLE',
  ADMIN_ADJUST: 'ADMIN_ADJUST'
};

exports.BadgeRarity = exports.$Enums.BadgeRarity = {
  COMMON: 'COMMON',
  RARE: 'RARE',
  EPIC: 'EPIC',
  LEGENDARY: 'LEGENDARY'
};

exports.LiveQuizStatus = exports.$Enums.LiveQuizStatus = {
  WAITING: 'WAITING',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED'
};

exports.LiveQuizEndReason = exports.$Enums.LiveQuizEndReason = {
  HOST_ENDED: 'HOST_ENDED',
  HOST_TIMEOUT: 'HOST_TIMEOUT',
  COMPLETED: 'COMPLETED',
  ADMIN_ENDED: 'ADMIN_ENDED',
  EXPIRED: 'EXPIRED'
};

exports.ContributionExportStatus = exports.$Enums.ContributionExportStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  READY: 'READY',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED'
};

exports.PomodoroPhase = exports.$Enums.PomodoroPhase = {
  WAITING: 'WAITING',
  FOCUS: 'FOCUS',
  SHORT_BREAK: 'SHORT_BREAK',
  LONG_BREAK: 'LONG_BREAK',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED'
};

exports.PomodoroPauseReason = exports.$Enums.PomodoroPauseReason = {
  HOST: 'HOST',
  RECOVERY: 'RECOVERY',
  EMPTY_ROOM: 'EMPTY_ROOM'
};

exports.RecordingLayout = exports.$Enums.RecordingLayout = {
  GRID: 'GRID',
  SPEAKER: 'SPEAKER'
};

exports.RecordingStatus = exports.$Enums.RecordingStatus = {
  STARTING: 'STARTING',
  RECORDING: 'RECORDING',
  STOPPING: 'STOPPING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED'
};

exports.RecordingStopReason = exports.$Enums.RecordingStopReason = {
  HOST_STOPPED: 'HOST_STOPPED',
  MEETING_ENDED: 'MEETING_ENDED',
  MAX_DURATION: 'MAX_DURATION',
  EGRESS_FAILED: 'EGRESS_FAILED',
  RETENTION: 'RETENTION'
};

exports.AttachmentKind = exports.$Enums.AttachmentKind = {
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  VOICE: 'VOICE',
  FILE: 'FILE'
};

exports.Prisma.ModelName = {
  User: 'User',
  RefreshToken: 'RefreshToken',
  Session: 'Session',
  BiometricCredential: 'BiometricCredential',
  Asset: 'Asset',
  AssetLink: 'AssetLink',
  AuditLog: 'AuditLog',
  Notification: 'Notification',
  NotificationRecipient: 'NotificationRecipient',
  NotificationPreference: 'NotificationPreference',
  ReadState: 'ReadState',
  WorkspaceMembership: 'WorkspaceMembership',
  ChannelGrant: 'ChannelGrant',
  Workspace: 'Workspace',
  InviteLink: 'InviteLink',
  WorkspaceDailyStat: 'WorkspaceDailyStat',
  Channel: 'Channel',
  ChannelMembership: 'ChannelMembership',
  Message: 'Message',
  MessageReaction: 'MessageReaction',
  MessageHide: 'MessageHide',
  DeviceToken: 'DeviceToken',
  SystemConfig: 'SystemConfig',
  Counter: 'Counter',
  OutboxEvent: 'OutboxEvent',
  UserBlock: 'UserBlock',
  Report: 'Report',
  Conversation: 'Conversation',
  ConversationMember: 'ConversationMember',
  Thread: 'Thread',
  ThreadSubscription: 'ThreadSubscription',
  SavedMessage: 'SavedMessage',
  Folder: 'Folder',
  Resource: 'Resource',
  Board: 'Board',
  Task: 'Task',
  Label: 'Label',
  TaskActivity: 'TaskActivity',
  TaskDependency: 'TaskDependency',
  RescheduleBatch: 'RescheduleBatch',
  TaskComment: 'TaskComment',
  TaskWatcher: 'TaskWatcher',
  TaskReviewRound: 'TaskReviewRound',
  TaskReview: 'TaskReview',
  WorkspaceInvitation: 'WorkspaceInvitation',
  WorkspaceWallet: 'WorkspaceWallet',
  WorkspaceExpense: 'WorkspaceExpense',
  ExpenseShare: 'ExpenseShare',
  Settlement: 'Settlement',
  WalletBalance: 'WalletBalance',
  UserPaymentProfile: 'UserPaymentProfile',
  StudySet: 'StudySet',
  StudyItem: 'StudyItem',
  WebhookEvent: 'WebhookEvent',
  Call: 'Call',
  CallParticipant: 'CallParticipant',
  Meeting: 'Meeting',
  MeetingAttendee: 'MeetingAttendee',
  MeetingSeries: 'MeetingSeries',
  MockAttempt: 'MockAttempt',
  MockAnswer: 'MockAnswer',
  SrEnrollment: 'SrEnrollment',
  SrProgress: 'SrProgress',
  SrReviewLog: 'SrReviewLog',
  XpRule: 'XpRule',
  XpEvent: 'XpEvent',
  XpDailyTotal: 'XpDailyTotal',
  UserGamification: 'UserGamification',
  Badge: 'Badge',
  UserBadge: 'UserBadge',
  LiveQuizSession: 'LiveQuizSession',
  LiveQuizResult: 'LiveQuizResult',
  WorkspaceTemplate: 'WorkspaceTemplate',
  WorkspaceTemplateApplication: 'WorkspaceTemplateApplication',
  AnnouncementRequest: 'AnnouncementRequest',
  AnnouncementReceipt: 'AnnouncementReceipt',
  ContributionTaskFact: 'ContributionTaskFact',
  ContributionReviewFact: 'ContributionReviewFact',
  ContributionSnapshot: 'ContributionSnapshot',
  ContributionBoardState: 'ContributionBoardState',
  ActivityDaily: 'ActivityDaily',
  ContributionExport: 'ContributionExport',
  PomodoroSession: 'PomodoroSession',
  PomodoroPresence: 'PomodoroPresence',
  MeetingRecap: 'MeetingRecap',
  MeetingRecording: 'MeetingRecording'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
