import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Floor' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
