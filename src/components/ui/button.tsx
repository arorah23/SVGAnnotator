import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const variantClasses =
      variant === "outline"
        ? "border border-slate-700 bg-transparent hover:border-blue-500"
        : variant === "ghost"
        ? "bg-transparent hover:bg-slate-800/70"
        : "bg-blue-600 hover:bg-blue-500";

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-white transition ${variantClasses} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
