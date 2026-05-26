type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export default function Card({
  children,
  className = "",
}: CardProps) {
  return (
    <div
      className={`min-w-0 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-lg sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
