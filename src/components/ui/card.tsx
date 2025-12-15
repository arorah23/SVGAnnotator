import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

type CardTitleProps = React.HTMLAttributes<HTMLParagraphElement>;

type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} {...props} />;
}

export function CardHeader({ className = "", ...props }: CardHeaderProps) {
  return <div className={`p-4 ${className}`} {...props} />;
}

export function CardTitle({ className = "", ...props }: CardTitleProps) {
  return <p className={`text-lg font-semibold leading-tight text-slate-800 ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: CardContentProps) {
  return <div className={`p-4 pt-0 ${className}`} {...props} />;
}
