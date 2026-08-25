"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // L'installabilité PWA est une amélioration, pas une exigence :
        // un échec d'enregistrement ne doit jamais bloquer l'application.
      });
    }
  }, []);

  return null;
}
