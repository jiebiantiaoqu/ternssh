export type SessionStatus = "connecting" | "open" | "closed" | "error";

export interface ServerSession {
  serverId: string;
  sessionId: string;
  wsUrl: string;
  sftpWsUrl: string;
  status: SessionStatus;
}

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  connecting: "连接中",
  open: "已连接",
  closed: "已断开",
  error: "错误",
};

export function isSessionAlive(status: SessionStatus | undefined): boolean {
  return status === "connecting" || status === "open";
}
