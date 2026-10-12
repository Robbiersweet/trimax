"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isPublicSchedulingPath } from "../lib/publicScheduling/routes";

const EmployeeAccess = dynamic(() => import("./AuthGuard"));

// Only the scheduling route family is public. Data authorization remains server-side.
export default function RouteAccessBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isPublicSchedulingPath(pathname)) return <>{children}</>;
  return <EmployeeAccess>{children}</EmployeeAccess>;
}

