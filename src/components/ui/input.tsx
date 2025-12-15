import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`w-full rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-inner shadow-slate-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/80 ${className}`}
      {...props}
    />
  );
});

Input.displayName = "Input";
