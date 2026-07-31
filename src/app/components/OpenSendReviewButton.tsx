"use client";

import Button from "./Button";

type OpenSendReviewButtonProps = {
  label: string;
  storageKey: string;
  targetId: string;
};

export default function OpenSendReviewButton({
  label,
  storageKey,
  targetId,
}: OpenSendReviewButtonProps) {
  function openReview() {
    const target = document.getElementById(targetId);
    const details =
      target?.querySelector<HTMLDetailsElement>(
        `details[data-persistent-details-key="${storageKey}"]`
      ) ?? target?.querySelector<HTMLDetailsElement>("details");

    if (details) {
      details.open = true;
      window.localStorage.setItem(storageKey, "open");
    }

    window.requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "start" });

      const firstFocusable = target?.querySelector<HTMLElement>(
        "button, a, input, textarea, select, [tabindex]:not([tabindex='-1'])"
      );
      firstFocusable?.focus({ preventScroll: true });
    });
  }

  return <Button onClick={openReview}>{label}</Button>;
}
