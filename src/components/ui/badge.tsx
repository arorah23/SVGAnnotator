import * as React from "react";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" };

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  const variantClasses =
    variant === "outline"
      ? "border border-slate-300 text-slate-700"
      : "bg-slate-100 text-slate-800 border border-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${variantClasses} ${className}`}
      {...props}
    />
  );
}
