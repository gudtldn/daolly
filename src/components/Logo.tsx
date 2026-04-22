interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Logo({ className = "", size = "md" }: LogoProps) {
  const sizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-3xl",
    xl: "text-5xl",
  };

  return (
    <span
      className={`font-black tracking-tighter text-primary-600 dark:text-primary-400 select-none ${sizeClasses[size]} ${className}`}
    >
      DAOLLY
    </span>
  );
}
