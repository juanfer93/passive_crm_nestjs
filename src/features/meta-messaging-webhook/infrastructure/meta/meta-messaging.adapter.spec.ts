import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { MetaMessagingAdapter } from '@/features/meta-messaging-webhook/infrastructure/meta/meta-messaging.adapter';

describe('MetaMessagingAdapter media security', () => {
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

function configService(): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) => defaultValue,
    getOrThrow: () => 'token',
  } as unknown as ConfigService;
}
