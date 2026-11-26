// The market page's view of Polygon: has Polymarket settled this condition yet?
// Read once per page view while the realm is not final; the realm stays the
// only thing that pays.
import { useEffect, useState } from 'react';
import { readAgreedSettlement } from './polygon';
import type { Settlement } from './polygon';

export function usePolygonSettlement(conditionId: string | null, active: boolean): Settlement | null {
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  useEffect(() => {
    if (!conditionId || !active) { setSettlement(null); return; }
    let cancelled = false;
    readAgreedSettlement(conditionId).then(read => { if (!cancelled) setSettlement(read.settlement); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [conditionId, active]);
  return settlement;
}
