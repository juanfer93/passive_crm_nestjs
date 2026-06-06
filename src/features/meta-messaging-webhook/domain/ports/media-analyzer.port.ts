import { MediaContent } from '@/features/meta-messaging-webhook/domain/entities/media-content.entity';

export const MEDIA_ANALYZER = Symbol('MEDIA_ANALYZER');

export interface MediaAnalyzerPort {
  transcribeAudio(media: MediaContent): Promise<string>;
  describeImage(media: MediaContent): Promise<string>;
}
