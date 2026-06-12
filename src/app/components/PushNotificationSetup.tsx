"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type PushNotificationSetupProps = {
  businessId?: string | null;
  businessSlug: string;
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

export default function PushNotificationSetup({
  businessId,
  businessSlug,
}: PushNotificationSetupProps) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");

  const saveSubscription = useCallback(
    async (subscription: PushSubscription) => {
      if (!businessId) {
        return "Workspace is still loading. Try again in a moment.";
      }

      const subscriptionJson = subscription.toJSON();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          business_id: businessId,
          user_id: user?.id ?? null,
          user_email: user?.email ?? null,
          business_slug: businessSlug,
          endpoint: subscription.endpoint,
          p256dh: subscriptionJson.keys?.p256dh ?? "",
          auth: subscriptionJson.keys?.auth ?? "",
          user_agent: navigator.userAgent,
          status: "active",
        },
        { onConflict: "endpoint" }
      );

      return error?.message ?? "";
    },
    [businessId, businessSlug]
  );

  useEffect(() => {
    async function checkCurrentStatus() {
      if (typeof window === "undefined") {
        return;
      }

      if (!("Notification" in window)) {
        setSupportMessage("This browser does not support push notifications.");
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setSupportMessage(
          "Open Trimax from a browser or installed app that supports web push."
        );
        return;
      }

      if (Notification.permission === "denied") {
        setSupportMessage(
          "Notifications are blocked for this browser. Change the browser site permission to enable them."
        );
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (Notification.permission === "granted" && subscription) {
          const saveError = await saveSubscription(subscription);

          setIsEnabled(true);
          setMessage(
            saveError
              ? `Notifications are allowed, but Trimax could not refresh this device record yet: ${saveError}`
              : "Notifications are enabled on this device."
          );
        }
      } catch {
        setSupportMessage("Notification status could not be checked yet.");
      }
    }

    checkCurrentStatus();
  }, [saveSubscription]);

  async function enableNotifications() {
    setMessage("");

    if (!businessId) {
      setMessage("Workspace is still loading. Try again in a moment.");
      return;
    }

    if (!("Notification" in window)) {
      setSupportMessage("This browser does not support push notifications.");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupportMessage("Install/open Trimax from a browser that supports web push.");
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!publicKey) {
      setMessage(
        "Push setup needs NEXT_PUBLIC_VAPID_PUBLIC_KEY added in Vercel first."
      );
      return;
    }

    setIsSaving(true);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setMessage("Notifications were not allowed on this device.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const saveError = await saveSubscription(subscription);

      if (saveError) {
        setMessage(saveError);
        return;
      }

      setMessage("Notifications are enabled on this device.");
      setIsEnabled(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to enable notifications on this device."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={`push-notification-card rounded-2xl border p-5 ${
        isEnabled
          ? "push-notification-card-enabled border-green-500/30 bg-green-500/10"
          : "push-notification-card-idle border-zinc-800 bg-zinc-950"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p
            className={`text-sm font-semibold ${
              isEnabled ? "text-green-200" : "text-white"
            }`}
          >
            {isEnabled ? "Device Notifications Enabled" : "Device Notifications"}
          </p>

          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {isEnabled
              ? "This browser is ready to receive Trimax alerts for this workspace."
              : "Enable this device so Trimax can alert you when new queue requests are created."}
          </p>
        </div>

        <Button onClick={enableNotifications} disabled={isSaving || isEnabled}>
          {isSaving
            ? "Enabling..."
            : isEnabled
              ? "Notifications Enabled"
              : "Enable Notifications"}
        </Button>
      </div>

      {message ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            isEnabled ? "text-green-200" : "text-zinc-300"
          }`}
        >
          {message}
        </p>
      ) : null}

      {supportMessage ? (
        <p className="mt-3 text-sm font-semibold text-amber-200">
          {supportMessage}
        </p>
      ) : null}
    </div>
  );
}
