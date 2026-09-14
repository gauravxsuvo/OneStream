"use client";

import { useEffect, useState } from "react";
import { getDisplayName, setDisplayName as persistName } from "@/lib/displayName";

export function useDisplayName() {
  const [name, setNameState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Deliberately read localStorage after mount (not via a lazy initializer): the server has
    // no access to it, so doing this in an effect keeps the first client render matching the
    // server-rendered markup instead of causing a hydration mismatch. `ready` gates the UI
    // until this has run once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNameState(getDisplayName());
    setReady(true);
  }, []);

  function setName(next: string) {
    persistName(next);
    setNameState(next);
  }

  return { name, setName, ready };
}
