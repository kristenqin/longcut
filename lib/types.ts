export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface Topic {
  id: string;
  title: string;
  description?: string;
  duration: number;
  segments: {
    start: number;
    end: number;
    text: string;
    startSegmentIdx?: number;
    endSegmentIdx?: number;
    startCharOffset?: number;
    endCharOffset?: number;
    hasCompleteSentences?: boolean;
    confidence?: number;
  }[];
  keywords?: string[];
  quote?: {
    timestamp: string;
    text: string;
  };
  isCitationReel?: boolean;
  autoPlay?: boolean;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: number | null;
  description?: string;
  tags?: string[];
  language?: string;
  availableLanguages?: string[];
}

export interface Citation {
  number: number;
  text: string;
  start: number;
  end: number;
  startSegmentIdx: number;
  endSegmentIdx: number;
  startCharOffset: number;
  endCharOffset: number;
}

export type PlaybackCommandType =
  | 'SEEK'
  | 'PLAY_TOPIC'
  | 'PLAY_SEGMENT'
  | 'PLAY'
  | 'PAUSE'
  | 'PLAY_ALL'
  | 'PLAY_CITATIONS';

export interface PlaybackCommand {
  type: PlaybackCommandType;
  time?: number;
  topic?: Topic;
  segment?: TranscriptSegment;
  citations?: Citation[];
  autoPlay?: boolean;
}
