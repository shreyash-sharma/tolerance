'use client';
import { useEffect } from 'react';

/** A plain browser redirect works in the static export, where a server redirect does not. */
export default function Page() {
  useEffect(() => { window.location.replace('/floor/'); }, []);
  return null;
}
