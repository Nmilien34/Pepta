// Onboarding — Device (T7, injections only). What the user actually injects
// with shapes dose logging and unlocks the reconstitution calculator for vial
// users (the concentration turn follows for them). Stored on the compound.

import React from 'react';
import type { InjectionDeviceType } from '@pepta/shared';
import { ConvoScreen } from '../../components';

export interface DeviceTypeScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: InjectionDeviceType): void;
}

export function DeviceTypeScreen({ progress, onBack, context, onAnswer }: DeviceTypeScreenProps) {
  return (
    <ConvoScreen<InjectionDeviceType>
      progress={progress}
      onBack={onBack}
      context={context}
      question="What do you inject with?"
      options={[
        { label: 'Single-dose pen', sub: 'one prefilled pen per shot', value: 'single_dose_pen' },
        { label: 'Auto-injector', sub: 'reusable or dial-a-dose pen', value: 'auto_injector' },
        { label: 'Syringe & vial', sub: 'you draw each dose', value: 'syringe_vial' },
        { label: 'Other or not sure', value: 'other' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
