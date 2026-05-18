type InputFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
};

export default function InputField({
  label,
  placeholder,
  value,
  onChange,
}: InputFieldProps) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-400">{label}</label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
      />
    </div>
  );
}