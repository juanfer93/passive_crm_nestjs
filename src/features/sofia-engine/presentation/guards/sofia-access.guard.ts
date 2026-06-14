import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export interface SofiaRequest extends Request {
  sofiaUserId: string;
  sofiaDealerId: string;
}

@Injectable()
export class SofiaAccessGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SofiaRequest>();
    const internalKey = this.config.get<string>('SOFIA_INTERNAL_API_KEY');
    const suppliedKey = this.header(request, 'x-internal-api-key');
    const userId = this.header(request, 'x-user-id');
    const dealerId = this.header(request, 'x-dealer-id');
    const permissions = this.header(request, 'x-user-permissions')
      .split(',')
      .map((permission) => permission.trim())
      .filter(Boolean);

    if (internalKey && suppliedKey === internalKey) {
      request.sofiaUserId = userId || 'internal-service';
      request.sofiaDealerId = dealerId;
      if (!request.sofiaDealerId) {
        throw new ForbiddenException('x-dealer-id is required for dealer scoping.');
      }
      return true;
    }

    const requiredPermission = request.method === 'POST' ? 'sofia:execute' : 'sofia:read';
    if (!userId || !dealerId || !permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `x-user-id, x-dealer-id, and ${requiredPermission} permission are required.`,
      );
    }

    request.sofiaUserId = userId;
    request.sofiaDealerId = dealerId;
    return true;
  }

  private header(request: Request, name: string): string {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
  }
}
