import { loadPlugin } from '@pascal-app/core';
import { builtinPlugin } from '@pascal-app/nodes';

// The viewer's built-in node kinds may be registered only once per page. The first-run preview and the 3D floor both need them,
// and they sit in different bundles, so the one shared promise lives on window.
export function ensureBuiltin(): Promise<unknown> {
  const w = window as any;
  return (w.__tolerancePlugin ||= loadPlugin(builtinPlugin));
}
