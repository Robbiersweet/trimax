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
  inputClassName = "app-form-input min-w-0 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 pr-24 text-white outline-none transition focus:border-orange-500 sm:pr-28",
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
    <div className="min-w-0">
      <label className={labelClassName}>{label}</label>

      <div className="relative min-w-0">
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
          className="app-calendar-button absolute right-2 top-1/2 max-w-[5.5rem] -translate-y-1/2 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-bold text-zinc-100 transition hover:border-orange-400 hover:text-orange-300 sm:max-w-none sm:px-3"
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
