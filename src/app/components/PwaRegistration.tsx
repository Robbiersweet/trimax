"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let hasRefreshedForNewWorker = false;
    const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>();

    const refreshForNewWorker = () => {
      if (hasRefreshedForNewWorker) {
        return;
      }

      hasRefreshedForNewWorker = true;
      window.location.reload();
    };

    const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
      registration.waiting?.postMessage({
        type: "TRIMAX_SKIP_WAITING",
      });
    };

    const watchRegistration = (registration: ServiceWorkerRegistration) => {
      activateWaitingWorker(registration);
      void registration.update();

      if (watchedRegistrations.has(registration)) {
        return;
      }

      watchedRegistrations.add(registration);

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;

        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener("statechange", () => {
          if (
            installingWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            activateWaitingWorker(registration);
          }
        });
      });
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(watchRegistration)
        .catch(() => {
          // Trimax still works as a normal website if PWA registration fails.
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          watchRegistration(registration);
        }
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      refreshForNewWorker
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        refreshForNewWorker
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
