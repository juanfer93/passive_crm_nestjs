import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { MetaSignatureGuard } from '@/features/meta-messaging-webhook/presentation/guards/meta-signature.guard';

describe('MetaSignatureGuard', () => {
  it('rejects requests when signature validation is enabled and META_APP_SECRET is missing', () => {
    const guard = new MetaSignatureGuard({ get: () => undefined } as unknown as ConfigService);

    expect(guard.canActivate({} as ExecutionContext)).toBe(false);
  });

  it('allows explicit local bypass only when signature validation is disabled', () => {
    const guard = new MetaSignatureGuard({
      get: (key: string) => (key === 'META_SIGNATURE_VALIDATION_DISABLED' ? 'true' : undefined),
    } as unknown as ConfigService);

    expect(guard.canActivate({} as ExecutionContext)).toBe(true);
  });

  it('validates Meta sha256 signatures against the raw body', () => {
    const secret = 'app-secret';
    const rawBody = Buffer.from('{"ok":true}');
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const guard = new MetaSignatureGuard({ get: () => secret } as unknown as ConfigService);

    expect(guard.canActivate(contextFor(rawBody, signature))).toBe(true);
    expect(guard.canActivate(contextFor(rawBody, 'sha256=bad'))).toBe(false);
  });
});

function contextFor(rawBody: Buffer, signature?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        rawBody,
        header: (name: string) => (name === 'x-hub-signature-256' ? signature : undefined),
      }),
    }),
  } as unknown as ExecutionContext;
}
