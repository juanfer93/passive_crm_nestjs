import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SofiaAccessGuard, SofiaRequest } from '@/features/sofia-engine/presentation/guards/sofia-access.guard';

describe('SofiaAccessGuard', () => {
  const config = { get: jest.fn() } as unknown as ConfigService;

  it('requires dealer scoped read permission', () => {
    const guard = new SofiaAccessGuard(config);
    expect(() => guard.canActivate(context({ method: 'GET', headers: {} }))).toThrow(
      ForbiddenException,
    );
  });

  it('attaches authorized user and dealer scope', () => {
    const request = {
      method: 'GET',
      headers: {
        'x-user-id': 'user-1',
        'x-dealer-id': 'dealer-1',
        'x-user-permissions': 'sofia:read',
      },
    } as unknown as SofiaRequest;
    const guard = new SofiaAccessGuard(config);

    expect(guard.canActivate(context(request))).toBe(true);
    expect(request.sofiaUserId).toBe('user-1');
    expect(request.sofiaDealerId).toBe('dealer-1');
  });
});

function context(request: Partial<SofiaRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
