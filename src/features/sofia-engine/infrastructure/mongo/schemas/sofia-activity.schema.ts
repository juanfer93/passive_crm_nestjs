import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type SofiaActivityDocument = HydratedDocument<SofiaActivity>;

@Schema({ collection: 'activities', versionKey: false })
export class SofiaActivity {
  @Prop({ required: true, index: true }) leadId: string;
  @Prop({ required: true, index: true }) dealerId: string;
  @Prop({ required: true }) type: string;
  @Prop({ required: true, enum: ['sofia_autonomous', 'sofia_assisted'] }) source: string;
  @Prop({ required: true }) status: string;
  @Prop({ required: true }) summary: string;
  @Prop() reason?: string;
  @Prop() confidence?: number;
  @Prop() channel?: string;
  @Prop() provider?: string;
  @Prop() providerMessageId?: string;
  @Prop() providerCallId?: string;
  @Prop({ type: SchemaTypes.Mixed }) metadata?: Record<string, unknown>;
  @Prop({ required: true, index: true }) createdAt: Date;
}

export const SofiaActivitySchema = SchemaFactory.createForClass(SofiaActivity);
SofiaActivitySchema.index({ leadId: 1, createdAt: -1 });
