import "server-only";

import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";

/**
 * Force-kill a child process and all its descendants.
 *
 * Node's `child.kill()` only SIGKILLs the immediate process. WhisperX
 * and faster-whisper spawn worker threads / subprocesses that keep
 * running (and keep GPU allocated) unless the whole tree is killed.
 *
 * Windows: taskkill /PID <pid> /T /F walks the process tree.
 * POSIX:   process.kill(-pgid, SIGKILL) targets the process group
 *          (works only if the child was spawned with detached: true,
 *          otherwise falls back to plain SIGKILL on the child).
 */
export function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;

  if (process.platform === "win32") {
    try {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], (err) => {
        if (err) {
          // Fall back to Node's kill if taskkill failed (PID already gone, etc).
          try {
            child.kill("SIGKILL");
          } catch {}
        }
      });
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
    return;
  }

  try {
    // If spawned with detached: true, negative pid = kill process group
    if (typeof pid === "number") {
      try {
        process.kill(-pid, "SIGKILL");
        return;
      } catch {
        // Not a group leader; fall through to plain kill.
      }
    }
    child.kill("SIGKILL");
  } catch {}
}
