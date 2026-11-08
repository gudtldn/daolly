import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";
import { trackCommand } from "@/utils/usage";

/** Tauri invoke + 사용 기록 (명령 이름, 처리 시간, 실패 여부. 인자 값은 남기지 않음) */
export async function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  const started = performance.now();
  try {
    const result = await tauriInvoke<T>(cmd, args);
    trackCommand(cmd, args, performance.now() - started, { result });
    return result;
  } catch (error) {
    trackCommand(cmd, args, performance.now() - started, { error });
    throw error;
  }
}
