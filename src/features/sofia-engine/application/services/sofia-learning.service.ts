import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SofiaAction,
  SofiaActionDocument,
} from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-action.schema';
import {
  SofiaActivity,
  SofiaActivityDocument,
} from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-activity.schema';

@Injectable()
export class SofiaLearningService {
  constructor(
    @InjectModel(SofiaAction.name)
    private readonly actionModel: Model<SofiaActionDocument>,
    @InjectModel(SofiaActivity.name)
    private readonly activityModel: Model<SofiaActivityDocument>,
  ) {}

  async generateLearningInsights(dealerId: string): Promise<Record<string, unknown>> {
    const [actions, activities] = await Promise.all([
      this.actionModel.find({ dealerId }).sort({ createdAt: -1 }).limit(200).lean().exec(),
      this.activityModel.find({ dealerId }).sort({ createdAt: -1 }).limit(500).lean().exec(),
    ]);
    const completed = actions.filter((action) => action.status === 'completed');
    const hours = completed
      .map((action) => action.executedAt ?? action.createdAt)
      .filter(Boolean)
      .map((date) => new Date(date).getHours());
    const bestHour = this.mode(hours);

    return {
      dealerId,
      dataSource: activities.length ? 'existing_sofia_activity' : 'demo_fallback',
      sampleSize: activities.length,
      insights: {
        bestContactWindow:
          bestHour === undefined ? 'Demo: 10:00 AM - 12:00 PM' : `${bestHour}:00 - ${bestHour + 1}:00`,
        bestConvertingVehicleType: 'Demo: SUV',
        leadSourceQuality: activities.length ? 'Sofia activity is accumulating.' : 'Demo: Meta leads show medium quality.',
        bdcResponseImpact: completed.length
          ? `${completed.length} Sofia actions completed in the current sample.`
          : 'Demo: faster BDC response improves appointment probability.',
        appointmentRiskPattern: 'Demo: unconfirmed appointments are highest risk within 24 hours.',
        documentCollectionPattern: 'Demo: document requests perform best after vehicle intent is confirmed.',
      },
    };
  }

  private mode(values: number[]): number | undefined {
    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  }
}
