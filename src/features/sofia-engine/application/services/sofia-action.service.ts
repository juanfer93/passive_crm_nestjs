import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetaMessagingAdapter } from '@/features/meta-messaging-webhook/infrastructure/meta/meta-messaging.adapter';
import { SofiaActivityService } from '@/features/sofia-engine/application/services/sofia-activity.service';
import { SofiaContextService } from '@/features/sofia-engine/application/services/sofia-context.service';
import { SofiaPromptService } from '@/features/sofia-engine/application/services/sofia-prompt.service';
import {
  ExecuteSofiaActionInput,
  SofiaActionType,
  SofiaChannel,
} from '@/features/sofia-engine/domain/sofia.types';
import {
  SofiaAction,
  SofiaActionDocument,
} from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-action.schema';

interface ProviderResult {
  provider: string;
  providerMessageId?: string;
  providerCallId?: string;
}

@Injectable()
export class SofiaActionService {
  private readonly messageActions: SofiaActionType[] = [
    'send_sms',
    'send_whatsapp',
    'confirm_appointment',
    'request_documents',
    'reengage_lead',
    'leave_voicemail',
  ];

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly contexts: SofiaContextService,
    private readonly prompts: SofiaPromptService,
    private readonly activity: SofiaActivityService,
    private readonly meta: MetaMessagingAdapter,
    @InjectModel(SofiaAction.name)
    private readonly actionModel: Model<SofiaActionDocument>,
  ) {}

  async executeSofiaAction(
    input: ExecuteSofiaActionInput,
    actor: { userId: string; dealerId: string },
  ): Promise<Record<string, unknown>> {
    const context = await this.contexts.buildSofiaContext(input.leadId, actor.dealerId);
    const autonomous = this.isEnabled('SOFIA_AUTONOMOUS_ENABLED');

    if (!input.approvedByUser && !autonomous) {
      throw new ForbiddenException('Manual user approval is required for Sofia actions.');
    }

    this.assertLeadCanBeContacted(context.riskFactors, input.actionType);
    this.assertBusinessHours(input.actionType);
    this.assertEditableMessage(input);
    await this.assertRateLimit(context.lead.id);

    const id = randomUUID();
    const source = autonomous && !input.approvedByUser ? 'sofia_autonomous' : 'sofia_assisted';
    const prompt = this.prompts.buildPrompt({
      actionType: input.actionType,
      leadId: context.lead.id,
      context,
    });
    const action = await this.actionModel.create({
      id,
      leadId: context.lead.id,
      dealerId: context.dealer.id,
      actionType: input.actionType,
      status: 'approved',
      channel: input.channel,
      approvedBy: input.approvedByUser ? actor.userId : 'sofia_autonomous',
      payload: input.payload,
      createdAt: new Date(),
    });

    await this.activity.record({
      leadId: context.lead.id,
      dealerId: context.dealer.id,
      type: 'sofia_generated_message',
      source,
      status: 'completed',
      summary: `Sofia built the centralized prompt for ${input.actionType}.`,
      channel: input.channel,
      metadata: { actionId: id, prompt },
    });

    try {
      const executedAt = new Date();
      await action.updateOne({ $set: { status: 'executing', executedAt } }).exec();
      const providerResult = await this.executeProvider(input, context);
      const completedAt = new Date();
      await action
        .updateOne({
          $set: {
            status: 'completed',
            completedAt,
            ...providerResult,
          },
        })
        .exec();
      await this.activity.record({
        leadId: context.lead.id,
        dealerId: context.dealer.id,
        type: this.activityType(input.actionType),
        source,
        status: 'completed',
        summary: `Sofia completed ${input.actionType}.`,
        channel: input.channel,
        ...providerResult,
        metadata: { actionId: id },
      });

      return {
        id,
        leadId: context.lead.id,
        dealerId: context.dealer.id,
        actionType: input.actionType,
        status: 'completed',
        executedAt,
        completedAt,
        ...providerResult,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await action.updateOne({ $set: { status: 'failed', error: message } }).exec();
      await this.activity.record({
        leadId: context.lead.id,
        dealerId: context.dealer.id,
        type: this.activityType(input.actionType),
        source,
        status: 'failed',
        summary: `Sofia could not complete ${input.actionType}.`,
        reason: message,
        channel: input.channel,
        metadata: { actionId: id },
      });
      throw error;
    }
  }

  private async executeProvider(
    input: ExecuteSofiaActionInput,
    context: Awaited<ReturnType<SofiaContextService['buildSofiaContext']>>,
  ): Promise<ProviderResult> {
    if (input.actionType === 'call_with_retell' || input.actionType === 'leave_voicemail') {
      return this.callWithRetell(context.lead.phone, input.payload);
    }

    if (input.actionType === 'create_task' || input.actionType === 'update_lead_status') {
      return { provider: 'viva_internal' };
    }

    const message = this.payloadString(input.payload, 'message');
    return this.sendMessage(input.channel, context, message);
  }

  private async sendMessage(
    channel: SofiaChannel,
    context: Awaited<ReturnType<SofiaContextService['buildSofiaContext']>>,
    message: string,
  ): Promise<ProviderResult> {
    if (channel === 'messenger' || channel === 'instagram') {
      await this.meta.sendTextMessage(
        channel,
        context.lead.contactId,
        message,
        context.lead.pageId,
      );
      return { provider: 'meta', providerMessageId: `meta:${randomUUID()}` };
    }

    if (channel === 'whatsapp') {
      void message;
      throw new BadRequestException(
        'GHL WhatsApp transport is not configured in NestJS yet. Use the VIVA/GHL workflow for WhatsApp sends.',
      );
    }

    if (channel === 'sms') {
      return this.sendTwilioSms(this.requirePhone(context.lead.phone), message);
    }

    throw new BadRequestException(`Channel ${channel} cannot send a message.`);
  }

  private async sendTwilioSms(to: string, message: string): Promise<ProviderResult> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_PHONE_NUMBER');
    if (!accountSid || !authToken || !from) {
      throw new BadRequestException('Twilio SMS is not configured.');
    }
    const body = new URLSearchParams({ To: to, From: from, Body: message });
    const response = await this.http.axiosRef.post<{ sid?: string }>(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      body.toString(),
      {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
    return { provider: 'twilio', providerMessageId: response.data.sid };
  }

  private async callWithRetell(
    phone: string | undefined,
    payload?: Record<string, unknown>,
  ): Promise<ProviderResult> {
    if (!this.isEnabled('AUTO_RETELL_CALLS_ENABLED')) {
      throw new ForbiddenException('Retell calls are disabled by AUTO_RETELL_CALLS_ENABLED.');
    }
    const apiKey = this.config.get<string>('RETELL_API_KEY');
    const fromNumber = this.config.get<string>('RETELL_FROM_NUMBER');
    const agentId = this.config.get<string>('RETELL_AGENT_ID');
    if (!apiKey || !fromNumber || !agentId) {
      throw new BadRequestException('Retell calling is not configured.');
    }
    const response = await this.http.axiosRef.post<{ call_id?: string }>(
      this.config.get<string>('RETELL_CREATE_CALL_URL', 'https://api.retellai.com/v2/create-phone-call'),
      {
        from_number: fromNumber,
        to_number: this.requirePhone(phone),
        override_agent_id: agentId,
        metadata: payload ?? {},
      },
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    return { provider: 'retell', providerCallId: response.data.call_id };
  }

  private assertLeadCanBeContacted(risks: string[], actionType: SofiaActionType): void {
    if (actionType === 'create_task' || actionType === 'update_lead_status') return;
    const blocked = risks.find((risk) => /opted out|wrong number/i.test(risk));
    if (blocked) throw new ForbiddenException(blocked);
  }

  private assertBusinessHours(actionType: SofiaActionType): void {
    if (actionType === 'create_task' || actionType === 'update_lead_status') return;
    if (this.isEnabled('SOFIA_ALLOW_OUTSIDE_BUSINESS_HOURS')) return;
    const timeZone = this.config.get<string>('SOFIA_BUSINESS_TIMEZONE', 'America/New_York');
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(
        new Date(),
      ),
    );
    const start = this.config.get<number>('SOFIA_BUSINESS_HOUR_START', 8);
    const end = this.config.get<number>('SOFIA_BUSINESS_HOUR_END', 20);
    if (hour < start || hour >= end) {
      throw new ForbiddenException(`Sofia actions are limited to business hours (${timeZone}).`);
    }
  }

  private assertEditableMessage(input: ExecuteSofiaActionInput): void {
    if (!this.messageActions.includes(input.actionType)) return;
    this.payloadString(input.payload, 'message');
  }

  private async assertRateLimit(leadId: string): Promise<void> {
    const windowMinutes = this.config.get<number>('SOFIA_RATE_LIMIT_WINDOW_MINUTES', 15);
    const maxActions = this.config.get<number>('SOFIA_RATE_LIMIT_PER_LEAD', 3);
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const count = await this.actionModel.countDocuments({ leadId, createdAt: { $gte: since } }).exec();
    if (count >= maxActions) {
      throw new HttpException(
        `Sofia action rate limit reached for lead ${leadId}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private payloadString(payload: Record<string, unknown> | undefined, key: string): string {
    const value = payload?.[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`payload.${key} is required and must be editable text.`);
    }
    return value.trim();
  }

  private requirePhone(phone?: string): string {
    if (!phone) throw new BadRequestException('The lead does not have a phone number.');
    return phone.startsWith('+') ? phone : `+${phone}`;
  }

  private isEnabled(key: string): boolean {
    return this.config.get<string>(key, 'false').toLowerCase() === 'true';
  }

  private activityType(actionType: SofiaActionType): string {
    const types: Record<SofiaActionType, string> = {
      call_with_retell: 'sofia_started_retell_call',
      send_sms: 'sofia_sent_sms',
      send_whatsapp: 'sofia_sent_whatsapp',
      confirm_appointment: 'sofia_confirmed_appointment',
      request_documents: 'sofia_requested_documents',
      reengage_lead: 'sofia_reengaged_lead',
      leave_voicemail: 'sofia_left_voicemail',
      create_task: 'sofia_created_task',
      update_lead_status: 'sofia_updated_lead_status',
    };
    return types[actionType];
  }
}
