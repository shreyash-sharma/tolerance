'use client';
import dynamic from 'next/dynamic';
import Shell from '@/components/Shell';

const FloorEditor = dynamic(() => import('@/components/FloorEditor'), { ssr: false });

export default function Page() {
  return (<Shell full><FloorEditor /></Shell>);
}
