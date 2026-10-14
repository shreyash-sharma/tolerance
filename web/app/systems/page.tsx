'use client';
import Shell from '@/components/Shell';
import LegacyFrame from '@/components/LegacyFrame';

export default function Page() {
  return (
    <Shell full>
      <LegacyFrame route="map" />
    </Shell>
  );
}
