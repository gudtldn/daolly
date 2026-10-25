import { describe, it, expect } from "vitest";
import { particle } from "@/utils/korean";

describe("particle", () => {
  it("받침이 있으면 앞의 조사, 없으면 뒤의 조사를 고른다", () => {
    expect(particle("와이셔츠", "을", "를")).toBe("를");
    expect(particle("정장 상의", "을", "를")).toBe("를");
    expect(particle("코트 (롱)", "을", "를")).toBe("을(를)");
    expect(particle("이불", "을", "를")).toBe("을");
    expect(particle("셔츠2", "을", "를")).toBe("을(를)");
  });
});
