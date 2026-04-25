import React, { forwardRef, KeyboardEvent, ChangeEvent, useRef, useImperativeHandle } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type" | "min" | "max" | "step"> {
  value: number | string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  containerClassName?: string;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, min, max, step = 1, className, containerClassName, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const updateValue = (newValue: number) => {
      let finalValue = newValue;
      if (min !== undefined) finalValue = Math.max(min, finalValue);
      if (max !== undefined) finalValue = Math.min(max, finalValue);
      onChange(finalValue);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const currentVal = typeof value === "number" ? value : (parseInt(String(value), 10) || 0);
        updateValue(currentVal + step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentVal = typeof value === "number" ? value : (parseInt(String(value), 10) || 0);
        updateValue(currentVal - step);
      } else if (props.onKeyDown) {
        props.onKeyDown(e);
      }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const valStr = e.target.value.replace(/[^0-9-]/g, "");
      if (valStr === "" || valStr === "-") {
        onChange(0);
        return;
      }
      onChange(parseInt(valStr, 10));
    };

    const increment = () => {
      const currentVal = typeof value === "number" ? value : (parseInt(String(value), 10) || 0);
      updateValue(currentVal + step);
      inputRef.current?.focus();
    };

    const decrement = () => {
      const currentVal = typeof value === "number" ? value : (parseInt(String(value), 10) || 0);
      updateValue(currentVal - step);
      inputRef.current?.focus();
    };

    return (
      <div className={`relative flex items-center ${containerClassName || "w-full"}`}>
        <input
          {...props}
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={`${className || ""} pr-6`}
        />
        <div className="absolute right-1 flex flex-col items-center justify-center h-full py-1">
          <button
            type="button"
            tabIndex={-1}
            onClick={increment}
            className="text-on-surface-muted hover:text-on-surface focus:outline-none h-1/2 flex items-center justify-center"
          >
            <ChevronUp className="w-[14px] h-[14px]" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={decrement}
            className="text-on-surface-muted hover:text-on-surface focus:outline-none h-1/2 flex items-center justify-center"
          >
            <ChevronDown className="w-[14px] h-[14px]" />
          </button>
        </div>
      </div>
    );
  }
);

NumberInput.displayName = "NumberInput";
