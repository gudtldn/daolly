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
 * 로컬 날짜의 시작 시각(00:00:00)을 UTC ISO 스트링으로 변환
 */
export function getStartOfLocalDateAsUTC(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * 로컬 날짜의 종료 시각(23:59:59)을 UTC ISO 스트링으로 변환
 */
export function getEndOfLocalDateAsUTC(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
