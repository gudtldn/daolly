import { toast } from "sonner";
import { useDialogStore } from "@/stores/dialogStore";
import { errorDetail, errorMessage } from "@/utils/errors";

/**
 * 실패를 알림으로 보여줍니다. 제목은 무엇이 안 됐는지, 본문은 왜 그런지(오류 문장).
 * 개발자용 원문이 있으면 '자세히'를 눌러 볼 수 있게 합니다.
 */
export function toastError(title: string, e: unknown) {
  const message = errorMessage(e);
  const detail = errorDetail(e);
  toast.error(title, {
    description: message,
    action: detail
      ? {
          label: "자세히",
          onClick: () => void useDialogStore.getState().showAlert({ title, message, detail }),
        }
      : undefined,
  });
}
