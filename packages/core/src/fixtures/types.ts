import type {
  UpsertChannelDayInput,
  UpsertChannelInput,
  UpsertProfileInput,
  UpsertVideoDayInput,
  UpsertVideoInput,
} from '../repositories/types.ts';

export interface SeedFixture {
  generatedAt: string;
  profile: UpsertProfileInput;
  channel: UpsertChannelInput;
  videos: UpsertVideoInput[];
  channelDaily: UpsertChannelDayInput[];
  videoDaily: UpsertVideoDayInput[];
}

export interface SeedDatabaseResult {
  videosInserted: number;
  channelDaysInserted: number;
  videoDaysInserted: number;
}
