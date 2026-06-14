import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SofiaActivity,
  SofiaActivityDocument,
} from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-activity.schema';

export interface RecordSofiaActivityInput {
  leadId: string;
  dealerId: string;
  type: string;
  source: 'sofia_autonomous' | 'sofia_assisted';
  status: string;
  summary: string;
  reason?: string;
  confidence?: number;
  channel?: string;
  provider?: string;
  providerMessageId?: string;
  providerCallId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SofiaActivityService {
  constructor(
    @InjectModel(SofiaActivity.name)
    private readonly activityModel: Model<SofiaActivityDocument>,
  ) {}

  async record(input: RecordSofiaActivityInput): Promise<SofiaActivity> {
    const activity = await this.activityModel.create({ ...input, createdAt: new Date() });
    return activity.toObject();
  }

  async findByLead(leadId: string, limit = 50): Promise<SofiaActivity[]> {
    return this.activityModel.find({ leadId }).sort({ createdAt: -1 }).limit(limit).lean().exec();
  }
}
