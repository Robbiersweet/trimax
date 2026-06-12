"use client";

import { useRef } from "react";

type DateInputFieldProps = {
  label: string;
  value?: string;
  defaultValue?: string;
  name?: string;
  onChange?: (value: string) => void;
  helperText?: string;
  labelClassName?: string;
  inputClassName?: string;
};

export default function DateInputField({
  label,
  value,
  defaultValue,
  name,
  onChange,
  helperText,
  labelClassName = "app-form-label mb-2 block text-sm text-zinc-400",
  inputClassName = "app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 pr-28 text-white outline-none transition focus:border-orange-500",
}: DateInputFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function openPicker() {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();

    const pickerInput = input as HTMLInputElement & {
      showPicker?: () => void;
    };

    pickerInput.showPicker?.();
  }

  return (
    <div>
      <label className={labelClassName}>{label}</label>

      <div className="relative">
        <input
          ref={inputRef}
          type="date"
          name={name}
          value={value}
          defaultValue={defaultValue}
          onChange={(event) => onChange?.(event.target.value)}
          className={inputClassName}
        />

        <button
          type="button"
          onClick={openPicker}
          className="app-calendar-button absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-100 transition hover:border-orange-400 hover:text-orange-300"
        >
          Calendar
        </button>
      </div>

      {helperText ? (
        <p className="app-helper-text mt-2 text-xs leading-5 text-zinc-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
