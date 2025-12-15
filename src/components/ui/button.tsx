import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const variantClasses =
      variant === "outline"
        ? "border border-slate-300 bg-white text-slate-800 hover:border-blue-500 hover:text-blue-700"
        : variant === "ghost"
        ? "bg-transparent text-slate-700 hover:bg-slate-100"
        : "bg-blue-600 text-white hover:bg-blue-500";

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition ${variantClasses} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
