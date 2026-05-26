type ToastProps = {
  type: "success" | "error";
  message: string;
};

export default function Toast({ type, message }: ToastProps) {
  const styles = {
    success:
      "app-toast-success border-emerald-400/45 bg-emerald-950 text-emerald-50 shadow-emerald-950/30",
    error:
      "app-toast-error border-red-400/45 bg-red-950 text-red-50 shadow-red-950/30",
  };

  return (
    <div
      className={`app-toast fixed bottom-6 right-6 z-50 max-w-[calc(100vw-2rem)] rounded-2xl border px-5 py-4 text-sm font-semibold leading-6 shadow-2xl sm:max-w-md ${styles[type]}`}
    >
      {message}
    </div>
  );
}
