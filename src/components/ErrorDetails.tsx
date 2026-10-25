import { errorDetail, errorMessage } from "@/utils/errors";

/** 오류 원문을 접어 두는 '자세한 내용 (개발자용)'. 원문이 없으면 그리지 않습니다. */
export function ErrorDetails({ detail, className = "" }: { detail?: string; className?: string }) {
  if (!detail) return null;
  return (
    <details className={`text-sm text-on-surface-muted ${className}`}>
      <summary className="cursor-pointer select-none">자세한 내용 (개발자용)</summary>
      <pre className="mt-2 p-3 bg-surface-elevated rounded-lg whitespace-pre-wrap break-all font-mono text-xs max-h-48 overflow-y-auto">
        {detail}
      </pre>
    </details>
  );
}

interface ErrorNoticeProps {
  /** 커맨드 에러, Error, 또는 화면에서 만든 안내 문장 */
  error: unknown;
  /** 바깥 상자의 모양 (화면마다 다름) */
  className: string;
}

/** 오류 문장 + 접어 둔 개발자용 원문 */
export function ErrorNotice({ error, className }: ErrorNoticeProps) {
  return (
    <div role="alert" className={className}>
      <p>{errorMessage(error)}</p>
      <ErrorDetails detail={errorDetail(error)} className="mt-2" />
    </div>
  );
}
