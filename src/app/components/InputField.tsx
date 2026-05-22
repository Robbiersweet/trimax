"use client";

import { useState } from "react";

type InputFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
};

export default function InputField({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
}: InputFieldProps) {
  const [showPassword, setShowPassword] =
    useState(false);

  const isPasswordField = type === "password";

  const inputType =
    isPasswordField && showPassword
      ? "text"
      : type;

  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-400">
        {label}
      </label>

      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 pr-16 text-white outline-none transition focus:border-orange-500"
        />

        {isPasswordField && (
          <button
            type="button"
            onClick={() =>
              setShowPassword(!showPassword)
            }
            className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400 hover:text-orange-400"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );
}