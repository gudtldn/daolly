import { ShoppingCart } from "lucide-react";

export function PosPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-secondary-400">
      <ShoppingCart className="w-16 h-16 mb-4" />
      <h2 className="text-2xl font-bold text-secondary-600 mb-2">접수 / 출고</h2>
      <p>준비 중입니다</p>
    </div>
  );
}
