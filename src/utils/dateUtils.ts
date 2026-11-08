/**
 * 날짜 및 시간 관련 공통 유틸리티
 */

/**
 * UTC ISO 스트링을 로컬 Date 객체로 변환
 */
export function toLocalDate(iso: string): Date {
  return new Date(iso);
}

/**
 * 오늘 날짜와 비교하여 스마트한 날짜/시간 문자열 반환
 */
export function formatSmartDateTime(iso: string): { date: string; time: string; isToday: boolean } {
  try {
    const d = new Date(iso);
    const now = new Date();
    
    const isToday = 
      d.getFullYear() === now.getFullYear() && 
      d.getMonth() === now.getMonth() && 
      d.getDate() === now.getDate();
    
    const isCurrentYear = d.getFullYear() === now.getFullYear();
    
    const hour = d.getHours();
    const minute = d.getMinutes();
    const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

    if (isToday) {
      return { date: "오늘", time: timeStr, isToday: true };
    }
    
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const dateStr = isCurrentYear ? `${month}/${day}` : `${d.getFullYear()}/${month}/${day}`;
    
    return { date: dateStr, time: timeStr, isToday: false };
  } catch (e) {
    console.error("formatSmartDateTime error:", e);
    return { 
      date: iso.slice(5, 10).replace("-", "/"), 
      time: iso.slice(11, 16), 
      isToday: false 
    };
  }
}

/**
 * Date를 이 PC 기준 날짜 문자열(YYYY-MM-DD)로 변환 (매출 조회 기간에 사용)
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 날짜 문자열(YYYY-MM-DD)을 이 PC 기준 자정의 Date로 변환
 * (new Date("YYYY-MM-DD")는 UTC 자정으로 해석되므로 쓰지 않음)
 */
export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}
