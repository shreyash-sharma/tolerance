'use client';
import dynamic from 'next/dynamic';
import Shell from '@/components/Shell';

const Playbooks = dynamic(() => import('@/components/Playbooks'), { ssr: false });

export default function Page() {
  return (<Shell><Playbooks /></Shell>);
}
