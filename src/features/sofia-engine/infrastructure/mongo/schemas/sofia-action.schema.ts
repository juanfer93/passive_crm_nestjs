import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type SofiaActionDocument = HydratedDocument<SofiaAction>;

@Schema({ collection: 'sofia_actions', versionKey: false })
export class SofiaAction {
  @Prop({ required: true, index: true }) id: string;
  @Prop({ required: true, index: true }) leadId: string;
  @Prop({ required: true, index: true }) dealerId: string;
  @Prop({ required: true }) actionType: string;
  @Prop({ required: true, index: true }) status: string;
  @Prop() priority?: string;
  @Prop() reason?: string;
  @Prop() confidence?: number;
  @Prop() potentialRevenue?: number;
  @Prop() channel?: string;
  @Prop() provider?: string;
  @Prop() providerCallId?: string;
  @Prop() providerMessageId?: string;
  @Prop() approvedBy?: string;
  @Prop({ type: SchemaTypes.Mixed }) payload?: Record<string, unknown>;
  @Prop() executedAt?: Date;
  @Prop() completedAt?: Date;
  @Prop() error?: string;
  @Prop({ required: true }) createdAt: Date;
}

export const SofiaActionSchema = SchemaFactory.createForClass(SofiaAction);
SofiaActionSchema.index({ leadId: 1, createdAt: -1 });
