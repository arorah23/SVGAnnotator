import * as React from "react";

type SwitchProps = {
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
};

export function Switch({ checked = false, onCheckedChange }: SwitchProps) {
  function toggle() {
    onCheckedChange?.(!checked);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={toggle}
      className={`h-6 w-11 rounded-full border border-slate-700 transition-colors ${
        checked ? "bg-blue-600" : "bg-slate-800"
      } flex items-center px-1`}
    >
      <span
        className={`block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
