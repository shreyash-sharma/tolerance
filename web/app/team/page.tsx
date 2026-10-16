'use client';
import dynamic from 'next/dynamic';
import Shell from '@/components/Shell';

const Team = dynamic(() => import('@/components/Team'), { ssr: false });

export default function Page() {
  return (<Shell><Team /></Shell>);
}
