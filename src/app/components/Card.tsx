type CardProps = {
  children: React.ReactNode;
  className?: string;
  id?: string;
};

export default function Card({
  children,
  className = "",
  id,
}: CardProps) {
  return (
    <div
      id={id}
      className={`app-card min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-lg sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
