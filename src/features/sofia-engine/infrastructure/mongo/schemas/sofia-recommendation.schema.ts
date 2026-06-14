import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type SofiaRecommendationDocument = HydratedDocument<SofiaRecommendationRecord>;

@Schema({ collection: 'sofia_recommendations', versionKey: false })
export class SofiaRecommendationRecord {
  @Prop({ required: true, index: true }) id: string;
  @Prop({ required: true, index: true }) leadId: string;
  @Prop({ required: true, index: true }) dealerId: string;
  @Prop({ required: true }) recommendedAction: string;
  @Prop({ required: true }) priority: string;
  @Prop({ required: true, type: SchemaTypes.Mixed }) reasoningJson: Record<string, unknown>;
  @Prop({ required: true }) confidence: number;
  @Prop() potentialRevenue?: number;
  @Prop({ required: true, type: SchemaTypes.Mixed }) nextBestActionsJson: string[];
  @Prop({ required: true, default: 'active' }) status: string;
  @Prop({ required: true }) createdAt: Date;
}

export const SofiaRecommendationSchema = SchemaFactory.createForClass(
  SofiaRecommendationRecord,
);
SofiaRecommendationSchema.index({ leadId: 1, createdAt: -1 });
