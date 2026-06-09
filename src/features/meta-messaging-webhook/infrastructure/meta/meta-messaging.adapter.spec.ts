import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { MetaMessagingAdapter } from '@/features/meta-messaging-webhook/infrastructure/meta/meta-messaging.adapter';

describe('MetaMessagingAdapter media security', () => {
  it('sends messages with the access token configured for the incoming page id', async () => {
    const post = jest.fn().mockResolvedValue({});
    const adapter = new MetaMessagingAdapter(
      { axiosRef: { post } } as unknown as HttpService,
      configService({
        META_PAGE_1_ID: 'page-1',
        META_PAGE_1_ACCESS_TOKEN: 'page-1-token',
        META_PAGE_2_ID: 'page-2',
        META_PAGE_2_ACCESS_TOKEN: 'page-2-token',
      }),
    );

    await adapter.sendTextMessage('messenger', 'contact-1', 'Hola', 'page-2');

    expect(post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/page-2/messages',
      expect.any(Object),
      expect.objectContaining({
        headers: { Authorization: 'Bearer page-2-token' },
      }),
    );
  });

  it('reads media ids with the access token configured for the incoming page id', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({
        data: { url: 'https://lookaside.fbsbx.com/audio.ogg', mime_type: 'audio/ogg' },
      })
      .mockResolvedValueOnce({
        data: Buffer.from('audio').buffer,
        headers: { 'content-type': 'audio/ogg' },
      });
    const adapter = new MetaMessagingAdapter(
      { axiosRef: { get } } as unknown as HttpService,
      configService({
        META_PAGE_1_ID: 'page-1',
        META_PAGE_1_ACCESS_TOKEN: 'page-1-token',
        META_PAGE_2_ID: 'page-2',
        META_PAGE_2_ACCESS_TOKEN: 'page-2-token',
      }),
    );

    await adapter.getMediaContent('media-id-1', 'page-1');

    expect(get).toHaveBeenNthCalledWith(
      1,
      'https://graph.facebook.com/v21.0/media-id-1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer page-1-token' },
      }),
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      'https://lookaside.fbsbx.com/audio.ogg',
      expect.objectContaining({
        headers: { Authorization: 'Bearer page-1-token' },
      }),
    );
  });

  it('rejects non-Meta direct media URLs', async () => {
    const adapter = new MetaMessagingAdapter(httpService(), configService());

    await expect(adapter.getMediaContent('https://attacker.example/private.json')).rejects.toThrow(
      'not allowed',
    );
  });

  it('rejects non-HTTPS direct media URLs', async () => {
    const adapter = new MetaMessagingAdapter(httpService(), configService());

    await expect(adapter.getMediaContent('http://lookaside.fbsbx.com/audio.ogg')).rejects.toThrow(
      'HTTPS',
    );
  });

  it('downloads allowed Meta CDN media without following redirects', async () => {
    const get = jest.fn().mockResolvedValue({
      data: Buffer.from('audio').buffer,
      headers: { 'content-type': 'audio/ogg' },
    });
    const adapter = new MetaMessagingAdapter(
      { axiosRef: { get } } as unknown as HttpService,
      configService(),
    );

    const media = await adapter.getMediaContent('https://lookaside.fbsbx.com/audio.ogg');

    expect(media.mimeType).toBe('audio/ogg');
    expect(get).toHaveBeenCalledWith(
      'https://lookaside.fbsbx.com/audio.ogg',
      expect.objectContaining({
        maxRedirects: 0,
        responseType: 'arraybuffer',
      }),
    );
  });
});

function httpService(): HttpService {
  return { axiosRef: { get: jest.fn() } } as unknown as HttpService;
}

function configService(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) => values[key] ?? defaultValue,
    getOrThrow: () => 'token',
  } as unknown as ConfigService;
}
