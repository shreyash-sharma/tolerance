'use client';
import { useEffect, useState } from 'react';

/** Pages not yet ported to React open the earlier interface inside the same shell. */
export default function LegacyFrame({ route }: { route: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_LEGACY_URL || `${window.location.protocol}//${window.location.hostname}:48410`;
    setSrc(`${host}/?embed=1#/${route}`);
  }, [route]);
  return (
    <div className="absolute inset-0 flex flex-col">
      {src ? <iframe title={route} src={src} className="min-h-0 w-full flex-1 border-0 bg-[#0b0d10]" /> : <div className="p-6 text-sm text-white/50">Loading…</div>}
    </div>
  );
}
