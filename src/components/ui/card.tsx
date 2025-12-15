import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

type CardTitleProps = React.HTMLAttributes<HTMLParagraphElement>;

type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-800/80 bg-slate-900/65 backdrop-blur-sm shadow-[0_18px_55px_-28px_rgba(0,0,0,0.8)] ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: CardHeaderProps) {
  return <div className={`p-4 ${className}`} {...props} />;
}

export function CardTitle({ className = "", ...props }: CardTitleProps) {
  return <p className={`text-lg font-semibold leading-tight ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: CardContentProps) {
  return <div className={`p-4 pt-0 ${className}`} {...props} />;
}
