import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const validationDisabled =
      this.config.get<string>('META_SIGNATURE_VALIDATION_DISABLED') === 'true';

    if (validationDisabled) {
      return true;
    }

    const appSecret = this.config.get<string>('META_APP_SECRET');

    if (!appSecret) {
      return false;
    }

    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const signature = request.header('x-hub-signature-256');

    if (!signature || !request.rawBody) {
      return false;
    }

    const expectedSignature = `sha256=${createHmac('sha256', appSecret)
      .update(request.rawBody)
      .digest('hex')}`;

    return this.safeCompare(signature, expectedSignature);
  }

  private safeCompare(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
