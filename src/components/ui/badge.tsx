import * as React from "react";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" };

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  const variantClasses =
    variant === "outline"
      ? "border border-slate-700 text-slate-200"
      : "bg-slate-800/70 text-slate-200 border border-slate-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${variantClasses} ${className}`}
      {...props}
    />
  );
}
