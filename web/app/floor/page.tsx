'use client';
import dynamic from 'next/dynamic';
import Shell from '@/components/Shell';

const Floor3D = dynamic(() => import('@/components/Floor3D'), { ssr: false });

export default function FloorPage() {
  return (
    <Shell full>
      <Floor3D />
    </Shell>
  );
}
