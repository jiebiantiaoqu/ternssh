import type { Terminal } from "@xterm/xterm";

const STORAGE_KEY = "ternssh-terminal-history";
const MAX_HISTORY = 200;
const MAX_SUGGESTIONS = 8;

const COMMON_COMMANDS = [
  "ls",
  "cd",
  "pwd",
  "cat",
  "grep",
  "tail",
  "head",
  "chmod",
  "chown",
  "mkdir",
  "rm",
  "mv",
  "cp",
  "ps",
  "top",
  "htop",
  "df",
  "du",
  "free",
  "systemctl",
  "journalctl",
  "docker",
  "docker ps",
  "docker compose ps",
  "kubectl",
  "git status",
  "git pull",
  "npm install",
  "curl",
  "wget",
  "ssh",
  "scp",
  "tar",
  "zip",
  "unzip",
  "nano",
  "vim",
  "sudo",
  "su",
  "exit",
  "clear",
  "history",
];

type HistoryStore = Record<string, string[]>;

function readStore(): HistoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HistoryStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: HistoryStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getTerminalHistory(serverId: string): string[] {
  return readStore()[serverId] ?? [];
}

export function pushTerminalHistory(serverId: string, command: string): void {
  const trimmed = command.trim();
  if (!trimmed || trimmed.startsWith(" ") || /[$#>❯➜λ]\s*$/.test(trimmed)) return;

  const store = readStore();
  const existing = store[serverId] ?? [];
  const next = [trimmed, ...existing.filter((item) => item !== trimmed)].slice(
    0,
    MAX_HISTORY,
  );
  store[serverId] = next;
  writeStore(store);
}

function readLineText(terminal: Terminal): string {
  const buffer = terminal.buffer.active;
  const row = buffer.getLine(buffer.baseY + buffer.cursorY);
  if (!row) return "";

  let text = "";
  for (let x = 0; x < row.length; x++) {
    text += row.getCell(x)?.getChars() ?? "";
  }
  return text.replace(/\s+$/g, "");
}

function extractCommandTail(line: string): string {
  const markers = ["$ ", "# ", "> ", "❯ ", "➜ ", "λ "];
  let start = 0;
  for (const marker of markers) {
    const index = line.lastIndexOf(marker);
    if (index >= start) {
      start = index + marker.length;
    }
  }

  // Prompts like root@host:~# often omit the trailing space after $ or #.
  const endPrompt = line.match(/[$#](?:\s*)?$/);
  if (endPrompt?.index !== undefined) {
    const cut = endPrompt.index + endPrompt[0].length;
    if (cut > start) {
      start = cut;
    }
  }

  return line.slice(start);
}

export function readTerminalPartialCommand(terminal: Terminal): string {
  return extractCommandTail(readLineText(terminal));
}

/** Apply a single onData payload to the local input draft (echo may arrive later). */
export function applyInputToDraft(draft: string, input: string): string {
  if (input.includes("\r") || input === "\n") return "";
  if (input === "\x7f" || input === "\x08") return draft.slice(0, -1);
  if (input === "\x15" || input === "\x03") return "";
  if (input.startsWith("\x1b") || input === "\t") return draft;
  if (/[\x00-\x1f\x7f]/.test(input)) return draft;
  return draft + input;
}

/** Reconcile local draft with the terminal buffer after server echo. */
export function syncDraftFromTerminal(
  terminal: Terminal,
  draft: string,
): string {
  const fromBuffer = readTerminalPartialCommand(terminal);
  if (draft.startsWith(fromBuffer) && draft.length > fromBuffer.length) {
    return draft;
  }
  return fromBuffer;
}

/** True when WebSocket output is likely prompt/input echo, not bulk command output. */
export function shouldSyncDraftFromEcho(data: string): boolean {
  if (data.startsWith("\x1b")) return true;
  return !data.includes("\n") && !data.includes("\r");
}

export function findTerminalSuggestions(
  serverId: string,
  partial: string,
  extraCommands: string[] = [],
): string[] {
  const normalized = partial.trimStart();
  const pool = [
    ...new Set([
      ...getTerminalHistory(serverId),
      ...extraCommands,
      ...COMMON_COMMANDS,
    ]),
  ];

  if (!normalized) {
    return [];
  }

  const lower = normalized.toLowerCase();
  const prefixMatches = pool.filter((item) =>
    item.toLowerCase().startsWith(lower),
  );
  if (prefixMatches.length > 0) {
    return prefixMatches.slice(0, MAX_SUGGESTIONS);
  }

  return pool
    .filter((item) => item.toLowerCase().includes(lower))
    .slice(0, MAX_SUGGESTIONS);
}

export function completionSuffix(partial: string, suggestion: string): string {
  if (suggestion.startsWith(partial)) {
    return suggestion.slice(partial.length);
  }
  return suggestion;
}
