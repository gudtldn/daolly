import React, { forwardRef, ChangeEvent } from "react";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: number;
  onChange: (value: number) => void;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, ...props }, ref) => {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const numericString = e.target.value.replace(/[^0-9]/g, "");
      const numericValue = numericString ? parseInt(numericString, 10) : 0;
      onChange(numericValue);
    };

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={value ? value.toLocaleString("ko-KR") : ""}
        onChange={handleChange}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
