"use client";

import { useState } from "react";
import DateInputField from "./DateInputField";

type InputFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  list?: string;
  options?: string[];
  maxVisibleOptions?: number;
  emptyOptionsMessage?: string;
  optionAliases?: (option: string) => string[];
  helperText?: string;
};

export default function InputField({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  list,
  options = [],
  maxVisibleOptions,
  emptyOptionsMessage = "No matching options.",
  optionAliases,
  helperText,
}: InputFieldProps) {
  const [showPassword, setShowPassword] =
    useState(false);
  const [isOptionsOpen, setIsOptionsOpen] =
    useState(false);
  const [shouldFilterOptions, setShouldFilterOptions] =
    useState(false);

  if (type === "date") {
    return (
      <DateInputField
        label={label}
        value={value}
        onChange={onChange}
        helperText={helperText}
      />
    );
  }

  const isPasswordField = type === "password";

  const inputType =
    isPasswordField && showPassword
      ? "text"
      : type;
  const normalizedValue = value.trim().toLowerCase();
  const hasCustomOptions = options.length > 0;
  const optionSearchValues = (option: string) =>
    [option, ...(optionAliases?.(option) ?? [])].map((alias) =>
      alias.trim().toLowerCase()
    );
  const matchedOptions =
    hasCustomOptions && shouldFilterOptions && normalizedValue
      ? options
          .map((option) => {
            const searchValues = optionSearchValues(option);
            const startsWithScore = searchValues.some((alias) =>
              alias.startsWith(normalizedValue)
            )
              ? 0
              : 1;
            const includesScore = searchValues.some((alias) =>
              alias.includes(normalizedValue)
            )
              ? 0
              : 1;

            return {
              option,
              rank: startsWithScore + includesScore,
            };
          })
          .filter((item) => item.rank < 2)
          .sort(
            (first, second) =>
              first.rank - second.rank ||
              first.option.localeCompare(second.option)
          )
          .map((item) => item.option)
      : options;
  const visibleOptions = maxVisibleOptions
    ? matchedOptions.slice(0, maxVisibleOptions)
    : matchedOptions;

  return (
    <div>
      <label className="app-form-label mb-2 block text-sm text-zinc-400">
        {label}
      </label>

      <div className="relative">
        <input
          type={inputType}
          list={hasCustomOptions ? undefined : list}
          value={value}
          onFocus={() => {
            setShouldFilterOptions(false);
            setIsOptionsOpen(hasCustomOptions);
          }}
          onClick={() => {
            setShouldFilterOptions(false);
            setIsOptionsOpen(hasCustomOptions);
          }}
          onBlur={() => {
            window.setTimeout(() => setIsOptionsOpen(false), 120);
          }}
          onChange={(event) => {
            setShouldFilterOptions(true);
            setIsOptionsOpen(hasCustomOptions);
            onChange(event.target.value);
          }}
          placeholder={placeholder}
          className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 pr-16 text-white outline-none transition focus:border-orange-500"
        />

        {isPasswordField && (
          <button
            type="button"
            onClick={() =>
              setShowPassword(!showPassword)
            }
            className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-400 hover:text-orange-400"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        )}

        {hasCustomOptions && isOptionsOpen ? (
          <div className="app-option-list absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 max-h-[300px] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            {visibleOptions.length > 0 ? (
              visibleOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option);
                    setShouldFilterOptions(false);
                    setIsOptionsOpen(false);
                  }}
                  className="app-option-item block w-full px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  {option}
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-zinc-400">
                {emptyOptionsMessage}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {helperText ? (
        <p className="app-helper-text mt-2 text-xs leading-5 text-zinc-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
