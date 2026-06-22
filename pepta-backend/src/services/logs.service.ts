import {
  activityLogResponseSchema,
  doseLogResponseSchema,
  mealLogResponseSchema,
  measurementResponseSchema,
  proteinLogResponseSchema,
  sideEffectLogResponseSchema,
  waterLogResponseSchema,
  weightLogResponseSchema,
} from '@pepta/shared';
import {
  ActivityLogModel,
  DoseLogModel,
  MealLogModel,
  MeasurementModel,
  ProteinLogModel,
  SideEffectLogModel,
  WaterLogModel,
  WeightLogModel,
} from '../models';
import { createCrudService } from './crud.service';

export const weightLogService = createCrudService({
  model: WeightLogModel,
  responseSchema: weightLogResponseSchema,
  name: 'Weight log',
  hasIdempotencyKey: false,
});

export const doseLogService = createCrudService({
  model: DoseLogModel,
  responseSchema: doseLogResponseSchema,
  name: 'Dose log',
  hasIdempotencyKey: true,
});

export const mealLogService = createCrudService({
  model: MealLogModel,
  responseSchema: mealLogResponseSchema,
  name: 'Meal log',
  hasIdempotencyKey: true,
});

export const waterLogService = createCrudService({
  model: WaterLogModel,
  responseSchema: waterLogResponseSchema,
  name: 'Water log',
  hasIdempotencyKey: true,
});

export const proteinLogService = createCrudService({
  model: ProteinLogModel,
  responseSchema: proteinLogResponseSchema,
  name: 'Protein log',
  hasIdempotencyKey: true,
});

export const activityLogService = createCrudService({
  model: ActivityLogModel,
  responseSchema: activityLogResponseSchema,
  name: 'Activity log',
  hasIdempotencyKey: true,
});

export const sideEffectLogService = createCrudService({
  model: SideEffectLogModel,
  responseSchema: sideEffectLogResponseSchema,
  name: 'Side effect log',
  hasIdempotencyKey: true,
});

export const measurementService = createCrudService({
  model: MeasurementModel,
  responseSchema: measurementResponseSchema,
  name: 'Measurement',
  hasIdempotencyKey: true,
});
