import { DurableObject } from "cloudflare:workers";
import { getCredentialValue, getServer } from "../db/servers";
import { SSHSession } from "../ssh/session";
import type { SSHConnectionConfig } from "../ssh/types";

interface SessionRow {
  id: string;
  user_id: string;
  server_id: string;
  status: string;
}

export class SshSession extends DurableObject<Env> {
  private sshSession: SSHSession | null = null;
  private terminalWs: WebSocket | null = null;
  private sftpSockets = new Set<WebSocket>();
  private bootstrapping: Promise<void> | null = null;

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const parsed = parseRequestUrl(request.url);
    if (!parsed) {
      return new Response("Invalid session URL", { status: 400 });
    }

    const session = await this.env.DB.prepare(
      "SELECT id, user_id, server_id, status FROM sessions WHERE id = ?",
    )
      .bind(parsed.sessionId)
      .first<SessionRow>();

    if (!session) {
      return new Response("Session not found", { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, serverWs] = Object.values(pair);
    this.ctx.acceptWebSocket(serverWs);

    if (parsed.channel === "sftp") {
      queueMicrotask(() => {
        void this.attachSftp(serverWs);
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    const serverRecord = await getServer(
      this.env.DB,
      session.user_id,
      session.server_id,
    );
    if (!serverRecord) {
      return new Response("Server not found", { status: 404 });
    }

    const credential = await getCredentialValue(
      this.env.DB,
      session.user_id,
      serverRecord.credential_ref,
    );
    if (!credential) {
      return new Response("Credential not found", { status: 404 });
    }

    const config: SSHConnectionConfig = {
      host: serverRecord.host,
      port: serverRecord.port,
      username: serverRecord.username,
      password: serverRecord.auth_type === "password" ? credential : "",
      authMethod:
        serverRecord.auth_type === "private_key" ? "publickey" : "password",
      privateKey:
        serverRecord.auth_type === "private_key" ? credential : undefined,
      cols: 120,
      rows: 40,
    };

    queueMicrotask(() => {
      void this.startTerminal(serverWs, config);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (this.sftpSockets.has(ws)) {
      await this.sshSession?.handleSFTPWebSocketMessage(message);
      return;
    }

    if (ws === this.terminalWs) {
      await this.sshSession?.handleWebSocketMessage(message);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ) {
    if (this.sftpSockets.has(ws)) {
      this.sftpSockets.delete(ws);
      this.sshSession?.detachSFTPWebSocket(ws, true);
      return;
    }

    if (ws === this.terminalWs) {
      this.terminalWs = null;
      this.sshSession?.close();
      this.sshSession = null;
      this.bootstrapping = null;
      for (const sftpWs of this.sftpSockets) {
        try {
          sftpWs.close(1000, "Terminal session closed");
        } catch {
          // ignore
        }
      }
      this.sftpSockets.clear();
    }
  }

  private async startTerminal(
    ws: WebSocket,
    config: SSHConnectionConfig,
  ): Promise<void> {
    this.terminalWs = ws;

    if (this.sshSession) {
      this.sshSession.close();
      this.sshSession = null;
    }

    try {
      await this.ensureSshSession(ws, config);
      await this.bootstrapping;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SSH connection failed";
      try {
        ws.send(JSON.stringify({ type: "error", message: `连接失败: ${message}` }));
        ws.close(1011, message);
      } catch {
        // ignore
      }
      this.terminalWs = null;
      this.sshSession = null;
      this.bootstrapping = null;
    }
  }

  private async attachSftp(ws: WebSocket): Promise<void> {
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      if (this.bootstrapping) {
        try {
          await this.bootstrapping;
        } catch {
          break;
        }
      }

      if (this.sshSession?.isSSHReady()) {
        this.sftpSockets.add(ws);
        this.sshSession.attachSFTPWebSocket(ws);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    try {
      ws.send(
        JSON.stringify({
          type: "sftp_error",
          operation: "init",
          message: this.sshSession
            ? "SSH 连接未就绪，请稍后重试"
            : "请先连接终端会话",
        }),
      );
      ws.close(1013, "SSH session not ready");
    } catch {
      // ignore
    }
  }

  private async ensureSshSession(
    ws: WebSocket,
    config: SSHConnectionConfig,
  ): Promise<void> {
    if (this.sshSession && this.bootstrapping) {
      await this.bootstrapping;
      return;
    }

    if (this.sshSession) return;

    this.bootstrapping = (async () => {
      const { connect } = await import("cloudflare:sockets");
      const hostname = config.host.includes(":")
        ? `[${config.host}]`
        : config.host;
      const socket = connect({ hostname, port: config.port });
      await socket.opened;

      const session = new SSHSession(ws, socket, config, false, false);
      this.sshSession = session;
      await session.startHandshake();
    })();

    await this.bootstrapping;
    this.bootstrapping = null;
  }
}

function parseRequestUrl(
  url: string,
): { sessionId: string; channel: "terminal" | "sftp" } | null {
  const pathname = new URL(url).pathname;
  const sftpMatch = pathname.match(/\/sessions\/([^/]+)\/sftp\/ws$/);
  if (sftpMatch?.[1]) {
    return { sessionId: sftpMatch[1], channel: "sftp" };
  }
  const terminalMatch = pathname.match(/\/sessions\/([^/]+)\/ws$/);
  if (terminalMatch?.[1]) {
    return { sessionId: terminalMatch[1], channel: "terminal" };
  }
  return null;
}
