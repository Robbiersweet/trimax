"use client";

import { useRouter } from "next/navigation";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type LogoutButtonProps = {
  className?: string;
};

export default function LogoutButton({
  className = "",
}: LogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      variant="secondary"
      onClick={handleLogout}
      className={className}
    >
      Logout
    </Button>
  );
}
