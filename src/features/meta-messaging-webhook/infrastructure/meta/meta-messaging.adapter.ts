import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { MediaContent } from '@/features/meta-messaging-webhook/domain/entities/media-content.entity';
import { MediaContentReaderPort } from '@/features/meta-messaging-webhook/domain/ports/media-content-reader.port';
import { MetaMessengerPort } from '@/features/meta-messaging-webhook/domain/ports/meta-messenger.port';

@Injectable()
export class MetaMessagingAdapter implements MetaMessengerPort, MediaContentReaderPort {
  private readonly defaultMediaAllowedHostSuffixes = [
    'fbcdn.net',
    'facebook.com',
    'fbsbx.com',
    'cdninstagram.com',
  ];

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async sendTextMessage(
    channel: MetaMessagingChannel,
    recipientId: string,
    text: string,
  ): Promise<void> {
    const metaNodeId = this.metaNodeIdFor(channel);

    await this.http.axiosRef.post(
      `${this.graphUrl}/${metaNodeId}/messages`,
      {
        ...(channel === 'messenger' ? { messaging_type: 'RESPONSE' } : {}),
        recipient: { id: recipientId },
        message: { text },
      },
      { headers: this.authorizationHeaders },
    );
  }

  async getMediaContent(mediaReference: string): Promise<MediaContent> {
    if (this.isUrl(mediaReference)) {
      const mediaUrl = this.assertAllowedMediaUrl(mediaReference);
      const media = await this.fetchMediaUrl(mediaUrl);

      return {
        id: mediaUrl.toString(),
        mimeType: this.headerAsString(media.headers['content-type']) ?? 'application/octet-stream',
        bytes: Buffer.from(media.data),
      };
    }

    const metadata = await this.http.axiosRef.get<{ url: string; mime_type?: string }>(
      `${this.graphUrl}/${mediaReference}`,
      { headers: this.authorizationHeaders },
    );

    const mediaUrl = this.assertAllowedMediaUrl(metadata.data.url);
    const media = await this.fetchMediaUrl(mediaUrl, this.authorizationHeaders);

    return {
      id: mediaReference,
      mimeType:
        metadata.data.mime_type ??
        this.headerAsString(media.headers['content-type']) ??
        'application/octet-stream',
      bytes: Buffer.from(media.data),
    };
  }

  private get graphUrl(): string {
    const baseUrl = this.config.get<string>('META_GRAPH_API_BASE_URL', 'https://graph.facebook.com');
    const version = this.config.get<string>('META_GRAPH_API_VERSION', 'v21.0');
    return `${baseUrl}/${version}`;
  }

  private metaNodeIdFor(channel: MetaMessagingChannel): string {
    if (channel === 'instagram') {
      return (
        this.config.get<string>('META_INSTAGRAM_ACCOUNT_ID') ??
        this.config.getOrThrow<string>('META_PAGE_ID')
      );
    }

    return (
      this.config.get<string>('META_MESSENGER_PAGE_ID') ??
      this.config.getOrThrow<string>('META_PAGE_ID')
    );
  }

  private get authorizationHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.getOrThrow<string>('META_ACCESS_TOKEN')}`,
    };
  }

  private isUrl(value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://');
  }

  private assertAllowedMediaUrl(value: string): URL {
    const url = new URL(value);

    if (url.protocol !== 'https:') {
      throw new Error('Meta media URL must use HTTPS.');
    }

    const hostname = url.hostname.toLowerCase();
    const allowed = this.mediaAllowedHostSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );

    if (!allowed) {
      throw new Error(`Meta media URL host is not allowed: ${url.hostname}`);
    }

    return url;
  }

  private async fetchMediaUrl(
    url: URL,
    headers?: Record<string, string>,
  ): Promise<{ data: ArrayBuffer; headers: Record<string, unknown> }> {
    const response = await this.http.axiosRef.get<ArrayBuffer>(url.toString(), {
      headers,
      maxBodyLength: this.maxMediaBytes,
      maxContentLength: this.maxMediaBytes,
      maxRedirects: 0,
      responseType: 'arraybuffer',
    });
    const bytes = Buffer.from(response.data);

    if (bytes.byteLength > this.maxMediaBytes) {
      throw new Error('Meta media payload exceeds the configured size limit.');
    }

    return { data: response.data, headers: response.headers };
  }

  private get mediaAllowedHostSuffixes(): string[] {
    const configuredHosts = this.config.get<string>('META_MEDIA_ALLOWED_HOSTS');

    if (!configuredHosts) {
      return this.defaultMediaAllowedHostSuffixes;
    }

    return configuredHosts
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  private get maxMediaBytes(): number {
    return this.config.get<number>('META_MEDIA_MAX_BYTES', 20 * 1024 * 1024);
  }

  private headerAsString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.find((item): item is string => typeof item === 'string');
    }

    return undefined;
  }
}
