import * as React from "react";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
      className={`w-full rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-inner shadow-slate-950/40 focus:outline-none focus:ring-2 focus:ring-blue-500/80 ${className}`}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
