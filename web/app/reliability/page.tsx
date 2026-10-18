'use client';
import dynamic from 'next/dynamic';
import Shell from '@/components/Shell';

const Reliability = dynamic(() => import('@/components/Reliability'), { ssr: false });

export default function Page() {
  return (<Shell><Reliability /></Shell>);
}
