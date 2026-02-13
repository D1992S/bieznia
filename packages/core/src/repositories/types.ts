export interface UpsertProfileInput {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppMetaEntryInput {
  key: string;
  value: string;
  updatedAt?: string;
}

export interface CreateSyncRunInput {
  profileId?: string | null;
  status: string;
  stage?: string | null;
  startedAt: string;
}

export interface FinishSyncRunInput {
  syncRunId: number;
  status: string;
  finishedAt: string;
  stage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface UpdateSyncRunCheckpointInput {
  syncRunId: number;
  status: string;
  stage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ResumeSyncRunInput {
  syncRunId: number;
  status: string;
  stage?: string | null;
}

export interface GetSyncRunByIdInput {
  syncRunId: number;
}

export interface GetLatestOpenSyncRunInput {
  profileId?: string | null;
}

export interface GetPersistedSyncBatchInput {
  syncRunId: number;
}

export interface GetChannelSnapshotInput {
  channelId: string;
}

export interface ChannelSnapshotRecord {
  channelId: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
}

export interface GetVideoSnapshotsInput {
  videoIds: readonly string[];
}

export interface VideoSnapshotRecord {
  videoId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface SyncRunRecord {
  id: number;
  profileId: string | null;
  status: string;
  stage: string | null;
  startedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface RawApiResponseInput {
  source: string;
  endpoint: string;
  requestParamsJson?: string | null;
  responseBodyJson: string;
  httpStatus: number;
  fetchedAt: string;
  syncRunId?: number | null;
}

export interface UpsertChannelInput {
  channelId: string;
  profileId?: string | null;
  name: string;
  description: string;
  thumbnailUrl?: string | null;
  publishedAt: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  lastSyncAt?: string | null;
  updatedAt?: string;
}

export interface UpsertVideoInput {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSeconds?: number | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl?: string | null;
  updatedAt?: string;
}

export interface UpsertChannelDayInput {
  channelId: string;
  date: string;
  subscribers: number;
  views: number;
  videos: number;
  likes: number;
  comments: number;
  watchTimeMinutes?: number | null;
  updatedAt?: string;
}

export interface UpsertVideoDayInput {
  videoId: string;
  channelId: string;
  date: string;
  views: number;
  likes: number;
  comments: number;
  watchTimeMinutes?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  updatedAt?: string;
}
