import React, { forwardRef, ChangeEvent } from "react";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: number;
  onChange: (value: number) => void;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, ...props }, ref) => {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const originalValue = input.value;
      
      // 숫자가 아닌 문자 제거
      const numericString = originalValue.replace(/[^0-9]/g, "");
      // 빈 문자열이면 0으로 처리
      const numericValue = numericString ? parseInt(numericString, 10) : 0;
      
      // 부모 상태 업데이트
      onChange(numericValue);

      // 브라우저 기본 동작으로 인해 입력된 '가짜' 값(예: '1,000a')을 
      // 현재 숫자에 맞는 형식으로 즉시 강제 변환합니다.
      // 이렇게 하면 숫자가 아닌 문자가 입력창에 남지 않고, 
      // 상태값이 변하지 않더라도 입력창은 항상 깨끗한 포맷을 유지합니다.
      const formatted = numericValue.toLocaleString("ko-KR");
      if (originalValue !== formatted) {
        input.value = formatted;
      }
    };

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        // 0일 때도 ""이 아닌 "0"으로 명시적으로 표시하여 값이 사라지는 느낌을 방지합니다.
        value={value.toLocaleString("ko-KR")}
        onChange={handleChange}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
