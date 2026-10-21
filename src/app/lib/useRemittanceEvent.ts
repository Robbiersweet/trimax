"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/** Stable UI event entry point; a retry always reads the latest review/workspace state. */
export function useRemittanceEvent<Args extends unknown[], Result>(handler: (...args: Args) => Result) {
  const current = useRef(handler);
  useLayoutEffect(() => { current.current = handler; });
  return useCallback((...args: Args) => current.current(...args), []);
}
