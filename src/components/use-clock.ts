"use client";
import { useEffect, useState } from "react";
// The clock is state so deadline labels change even when ticket data is unchanged.
export function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
