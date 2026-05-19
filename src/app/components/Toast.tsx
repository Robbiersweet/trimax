type ToastProps = {
  type: "success" | "error";
  message: string;
};

export default function Toast({ type, message }: ToastProps) {
  const styles = {
    success: "border-green-500/40 bg-green-500/10 text-green-300",
    error: "border-red-500/40 bg-red-500/10 text-red-300",
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 rounded-2xl border px-5 py-4 shadow-2xl ${styles[type]}`}
    >
      {message}
    </div>
  );
}