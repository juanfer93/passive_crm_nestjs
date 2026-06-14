import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SofiaActionService } from '@/features/sofia-engine/application/services/sofia-action.service';
import { SofiaActivityService } from '@/features/sofia-engine/application/services/sofia-activity.service';
import { SofiaContextService } from '@/features/sofia-engine/application/services/sofia-context.service';
import { SofiaDecisionService } from '@/features/sofia-engine/application/services/sofia-decision.service';
import { SofiaLearningService } from '@/features/sofia-engine/application/services/sofia-learning.service';
import {
  ExecuteSofiaActionInput,
  SofiaActionType,
  SofiaChannel,
} from '@/features/sofia-engine/domain/sofia.types';
import {
  SofiaAccessGuard,
  SofiaRequest,
} from '@/features/sofia-engine/presentation/guards/sofia-access.guard';

const actionTypes: SofiaActionType[] = [
  'call_with_retell',
  'send_sms',
  'send_whatsapp',
  'confirm_appointment',
  'request_documents',
  'reengage_lead',
  'leave_voicemail',
  'create_task',
  'update_lead_status',
];
const channels: SofiaChannel[] = [
  'messenger',
  'instagram',
  'whatsapp',
  'sms',
  'phone',
  'internal',
];

@Controller('api/sofia')
@UseGuards(SofiaAccessGuard)
export class SofiaEngineController {
  constructor(
    private readonly contexts: SofiaContextService,
    private readonly decisions: SofiaDecisionService,
    private readonly actions: SofiaActionService,
    private readonly learning: SofiaLearningService,
    private readonly activity: SofiaActivityService,
  ) {}

  @Get('context/:leadId')
  getContext(@Param('leadId') leadId: string, @Req() request: SofiaRequest) {
    return this.contexts.buildSofiaContext(leadId, request.sofiaDealerId);
  }

  @Get('recommendation/:leadId')
  getRecommendation(@Param('leadId') leadId: string, @Req() request: SofiaRequest) {
    return this.decisions.generateRecommendation(leadId, request.sofiaDealerId);
  }

  @Post('execute')
  execute(@Body() input: ExecuteSofiaActionInput, @Req() request: SofiaRequest) {
    this.validateExecuteInput(input);
    return this.actions.executeSofiaAction(input, {
      userId: request.sofiaUserId,
      dealerId: request.sofiaDealerId,
    });
  }

  @Get('learning/:dealerId')
  getLearning(@Param('dealerId') dealerId: string, @Req() request: SofiaRequest) {
    if (dealerId !== request.sofiaDealerId) {
      throw new BadRequestException('Requested dealer does not match x-dealer-id.');
    }
    return this.learning.generateLearningInsights(dealerId);
  }

  @Get('activity/:leadId')
  async getActivity(@Param('leadId') leadId: string, @Req() request: SofiaRequest) {
    const context = await this.contexts.buildSofiaContext(leadId, request.sofiaDealerId);
    return this.activity.findByLead(context.lead.id);
  }

  private validateExecuteInput(input: ExecuteSofiaActionInput): void {
    if (!input?.leadId || !actionTypes.includes(input.actionType) || !channels.includes(input.channel)) {
      throw new BadRequestException('leadId, a supported actionType, and a supported channel are required.');
    }
    if (typeof input.approvedByUser !== 'boolean') {
      throw new BadRequestException('approvedByUser must be a boolean.');
    }
  }
}
