/**
 * 낱말의 받침에 맞는 조사를 고릅니다.
 * particle("와이셔츠", "을", "를") → "를", particle("바지", "을", "를") → "를", particle("코트", "을", "를") → "를"
 * 한글로 끝나지 않으면 "을(를)"처럼 둘 다 적습니다.
 */
export function particle(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.trim().charCodeAt(word.trim().length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0 ? withFinal : withoutFinal;
  }
  return `${withFinal}(${withoutFinal})`;
}
