type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  className?: string;
};

export default function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
}: ButtonProps) {
  const base =
    "rounded-2xl px-5 py-3 font-semibold transition hover:opacity-90";

  const styles = {
    primary: "bg-orange-500 text-black",
    secondary: "bg-zinc-800 text-white",
  };

  return (
    <button
      onClick={onClick}
      className={`${base} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}