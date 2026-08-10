import type { ReactNode } from "react";
import { useAuth } from "../utils/AuthContext";

type Props = {
  value: number | string;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** When false, never blur (for non-currency figures). */
  sensitive?: boolean;
};

/** Formats a figure; blurs it in observe mode so the app is safe to showcase. */
export default function Money({
  value,
  prefix = "",
  suffix = "",
  className = "",
  sensitive = true,
}: Props) {
  const { isObserve } = useAuth();
  const text =
    typeof value === "number"
      ? `${prefix}${value.toLocaleString()}${suffix}`
      : `${prefix}${value}${suffix}`;

  if (!sensitive || !isObserve) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span
      className={`money-blur ${className}`.trim()}
      title="Hidden in observe mode"
      aria-label="Amount hidden"
    >
      {text}
    </span>
  );
}

/** Blur a whole money chart / block in observe mode. */
export function MoneyShield({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isObserve } = useAuth();
  return (
    <div
      className={`${className} ${isObserve ? "money-blur-block" : ""}`.trim()}
      aria-hidden={isObserve || undefined}
    >
      {children}
    </div>
  );
}
