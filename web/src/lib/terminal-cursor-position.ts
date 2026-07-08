import type { Terminal } from "@xterm/xterm";

export interface TerminalCursorStyle {
  left: number;
  top: number;
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
}

function getCellDimensions(terminal: Terminal): { width: number; height: number } {
  const element = terminal.element;
  if (!element) return { width: 8, height: 17 };

  const screen = element.querySelector(".xterm-screen");
  if (!screen) return { width: 8, height: 17 };

  const rect = screen.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || terminal.cols <= 0 || terminal.rows <= 0) {
    return { width: 8, height: 17 };
  }

  return {
    width: rect.width / terminal.cols,
    height: rect.height / terminal.rows,
  };
}

export function getTerminalCursorStyle(
  terminal: Terminal,
  host: HTMLElement | null,
): TerminalCursorStyle | null {
  if (!host || !terminal.element) return null;

  const buffer = terminal.buffer.active;
  const screen = terminal.element.querySelector(".xterm-screen");
  if (!screen) return null;

  const hostRect = host.getBoundingClientRect();
  const screenRect = screen.getBoundingClientRect();
  const { width: cellWidth, height: cellHeight } = getCellDimensions(terminal);

  const left = screenRect.left - hostRect.left + buffer.cursorX * cellWidth;
  const top = screenRect.top - hostRect.top + buffer.cursorY * cellHeight;
  const maxWidth = Math.max(0, (terminal.cols - buffer.cursorX) * cellWidth);

  return {
    left,
    top,
    maxWidth,
    fontSize: terminal.options.fontSize ?? 13,
    lineHeight: cellHeight,
    fontFamily:
      terminal.options.fontFamily ??
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  };
}
