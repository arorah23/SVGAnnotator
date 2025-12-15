import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const variantClasses =
      variant === "outline"
        ? "border border-slate-700/70 bg-transparent hover:border-blue-400 hover:text-white"
        : variant === "ghost"
        ? "bg-transparent hover:bg-slate-800/60"
        : "bg-gradient-to-r from-blue-500 to-cyan-400 hover:shadow-[0_10px_35px_-15px_rgba(59,130,246,0.75)]";

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${variantClasses} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
