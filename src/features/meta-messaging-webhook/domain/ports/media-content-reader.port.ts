import { MediaContent } from '@/features/meta-messaging-webhook/domain/entities/media-content.entity';

export const MEDIA_CONTENT_READER = Symbol('MEDIA_CONTENT_READER');

export interface MediaContentReaderPort {
  getMediaContent(mediaReference: string): Promise<MediaContent>;
}
