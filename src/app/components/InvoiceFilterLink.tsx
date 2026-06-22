"use client";

import { useRouter } from "next/navigation";

type InvoiceFilterLinkProps = {
  href: string;
  ariaCurrent?: "page";
  className: string;
  children: React.ReactNode;
};

export const invoiceFilterScrollKey = "trimax.invoiceFilterScroll";

export default function InvoiceFilterLink({
  href,
  ariaCurrent,
  className,
  children,
}: InvoiceFilterLinkProps) {
  const router = useRouter();

  return (
    <a
      href={href}
      aria-current={ariaCurrent}
      className={className}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        sessionStorage.setItem(invoiceFilterScrollKey, "1");
        router.push(href, { scroll: false });
      }}
    >
      {children}
    </a>
  );
}
