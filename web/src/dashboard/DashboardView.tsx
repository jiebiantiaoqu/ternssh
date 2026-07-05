import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type Dashboard, type TreeNode } from "@/lib/api";
import {
  isSessionAlive,
  SESSION_STATUS_LABEL,
  type ServerSession,
  type SessionStatus,
} from "@/lib/sessions";
import { ServerListWidget } from "@/widgets/ServerListWidget";
import { FileManagerWidget } from "@/widgets/FileManagerWidget";
import { TerminalWidget } from "@/widgets/TerminalWidget";
import type { WidgetContext } from "@/widgets/types";
import { AddGroupDialog } from "./AddGroupDialog";
import { AddServerDialog } from "./AddServerDialog";
import { RenameGroupDialog } from "./RenameGroupDialog";
import { GridDashboard } from "./GridDashboard";
import { layoutsEqual, type GridItem } from "./grid-utils";

const WIDGET_TITLES: Record<string, string> = {
  server_list: "服务器",
  terminal: "终端",
  file_manager: "文件管理",
  status: "状态",
};

function widgetsToLayout(widgets: Dashboard["widgets"]): GridItem[] {
  return widgets.map((widget) => ({
    i: widget.id,
    x: widget.grid_x,
    y: widget.grid_y,
    w: widget.grid_w,
    h: widget.grid_h,
    minW: 2,
    minH: 3,
    maxW: 12,
  }));
}

function layoutToWidgets(
  dashboard: Dashboard,
  layout: GridItem[],
): Dashboard["widgets"] {
  const byId = new Map(dashboard.widgets.map((widget) => [widget.id, widget]));

  return layout
    .map((item) => {
      const widget = byId.get(item.i);
      if (!widget) return null;
      return {
        ...widget,
        grid_x: item.x,
        grid_y: item.y,
        grid_w: item.w,
        grid_h: item.h,
      };
    })
    .filter((widget): widget is Dashboard["widgets"][number] => widget !== null);
}

export function DashboardView() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [layout, setLayout] = useState<GridItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeMoving, setTreeMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, ServerSession>>({});
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [addOpen, setAddOpen] = useState(false);
  const [addGroupId, setAddGroupId] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupParentId, setGroupParentId] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameGroupId, setRenameGroupId] = useState<string | null>(null);
  const [renameGroupName, setRenameGroupName] = useState("");
  const dashboardRef = useRef<Dashboard | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const isEditingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, treeResponse] = await Promise.all([
        api.getDashboard(),
        api.getServerTree(),
      ]);
      dashboardRef.current = dashboardResponse;
      setDashboard(dashboardResponse);
      setTree(treeResponse.tree);

      if (!isEditingRef.current) {
        setLayout(widgetsToLayout(dashboardResponse.widgets));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  const handleSessionStatusChange = useCallback(
    (serverId: string, status: SessionStatus) => {
      setSessions((current) => {
        const session = current[serverId];
        if (!session || session.status === status) return current;
        return {
          ...current,
          [serverId]: { ...session, status },
        };
      });
    },
    [],
  );

  const handleSessionClosed = useCallback((serverId: string) => {
    setSessions((current) => {
      const session = current[serverId];
      if (!session) return current;
      return {
        ...current,
        [serverId]: { ...session, status: "closed" },
      };
    });
  }, []);

  const handleDisconnectServer = useCallback((serverId: string) => {
    setSessions((current) => {
      const next = { ...current };
      delete next[serverId];
      setActiveServerId((active) => {
        if (active !== serverId) return active;
        return Object.keys(next)[0] ?? null;
      });
      return next;
    });
  }, []);

  const handleConnectServer = useCallback(async (serverId: string) => {
    setActiveServerId(serverId);
    const existing = sessionsRef.current[serverId];
    if (existing && isSessionAlive(existing.status)) {
      return;
    }

    try {
      const session = await api.createSession(serverId);
      setSessions((current) => ({
        ...current,
        [serverId]: {
          serverId,
          sessionId: session.sessionId,
          wsUrl: session.wsUrl,
          sftpWsUrl: session.sftpWsUrl,
          status: "connecting",
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建会话失败");
    }
  }, []);

  const widgetContext = useMemo(
    () => ({
      activeServerId,
      sessions,
      onSelectServer: setActiveServerId,
      onConnectServer: (serverId: string) => {
        void handleConnectServer(serverId);
      },
      onDisconnectServer: handleDisconnectServer,
    }),
    [activeServerId, sessions, handleConnectServer, handleDisconnectServer],
  );

  const sessionList = useMemo(
    () => Object.values(sessions),
    [sessions],
  );

  const terminalBadge = useMemo(() => {
    const active = activeServerId ? sessions[activeServerId] : null;
    if (!active) {
      const openCount = sessionList.filter((item) => item.status === "open").length;
      return openCount > 0 ? `${openCount} 个会话` : "idle";
    }
    return SESSION_STATUS_LABEL[active.status] ?? active.status;
  }, [activeServerId, sessionList, sessions]);

  const handleLayoutChange = useCallback((nextLayout: GridItem[]) => {
    isEditingRef.current = true;
    setLayout((current) =>
      layoutsEqual(current, nextLayout) ? current : nextLayout,
    );

    const dashboardSnapshot = dashboardRef.current;
    if (!dashboardSnapshot) return;

    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      void (async () => {
        const widgets = layoutToWidgets(dashboardSnapshot, nextLayout);
        try {
          const updated = await api.updateDashboard({ widgets });
          dashboardRef.current = updated;
          setDashboard(updated);
        } catch (err) {
          setError(err instanceof Error ? err.message : "保存布局失败");
        } finally {
          isEditingRef.current = false;
        }
      })();
    }, 400);
  }, []);

  const handleDeleteServer = async (serverId: string) => {
    handleDisconnectServer(serverId);
    await api.deleteServer(serverId);
    if (activeServerId === serverId) {
      setActiveServerId(null);
    }
    await load();
  };

  const handleDeleteGroup = async (groupId: string) => {
    await api.deleteGroup(groupId);
    await load();
  };

  const handleMoveItem = async (input: {
    type: "server" | "group";
    id: string;
    parentId: string | null;
    index: number;
  }) => {
    setTreeMoving(true);
    setError(null);
    try {
      const response = await api.moveTreeItem(input);
      setTree(response.tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : "移动失败");
      await load();
    } finally {
      setTreeMoving(false);
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="workspace flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        正在加载工作区...
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="workspace flex items-center justify-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!dashboard || layout.length === 0) return null;

  const widgetById = new Map(dashboard.widgets.map((widget) => [widget.id, widget]));

  return (
    <div className="workspace">
      {error && (
        <div className="workspace-toast text-red-400">{error}</div>
      )}

      <GridDashboard
        layout={layout}
        onLayoutChange={handleLayoutChange}
        getItemTitle={(item) => {
          const widget = widgetById.get(item.i);
          if (!widget) return "组件";
          return WIDGET_TITLES[widget.type] ?? widget.type;
        }}
        renderHandleActions={(item) => {
          const widget = widgetById.get(item.i);
          if (!widget) return null;

          if (widget.type === "server_list") {
            return (
              <div className="widget-no-drag flex items-center gap-1">
                <Button
                  className="widget-no-drag"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setGroupParentId(null);
                    setGroupOpen(true);
                  }}
                >
                  <FolderPlus className="mr-1 h-3 w-3" />
                  分组
                </Button>
                <Button
                  className="widget-no-drag"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAddGroupId(null);
                    setAddOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  添加
                </Button>
              </div>
            );
          }

          if (widget.type === "terminal") {
            return <Badge>{terminalBadge}</Badge>;
          }

          return null;
        }}
        renderItem={(item) => {
          const widget = widgetById.get(item.i);
          if (!widget) return null;

          if (widget.type === "server_list") {
            return (
              <ServerListWidget
                tree={tree}
                loading={loading}
                moving={treeMoving}
                context={widgetContext}
                onDeleteServer={(serverId) => void handleDeleteServer(serverId)}
                onDeleteGroup={(groupId) => void handleDeleteGroup(groupId)}
                onMoveItem={handleMoveItem}
                onAddServer={(groupId) => {
                  setAddGroupId(groupId);
                  setAddOpen(true);
                }}
                onAddGroup={(parentId) => {
                  setGroupParentId(parentId);
                  setGroupOpen(true);
                }}
                onRenameGroup={(groupId, name) => {
                  setRenameGroupId(groupId);
                  setRenameGroupName(name);
                  setRenameOpen(true);
                }}
              />
            );
          }

          if (widget.type === "terminal") {
            return (
              <TerminalWidget
                sessions={sessionList}
                activeServerId={activeServerId}
                onSessionStatusChange={handleSessionStatusChange}
                onSessionClosed={handleSessionClosed}
              />
            );
          }

          if (widget.type === "file_manager") {
            return (
              <FileManagerWidget
                activeServerId={activeServerId}
                sessions={sessions}
              />
            );
          }

          return (
            <div className="flex h-full items-center justify-center p-3 text-sm text-[var(--color-muted-foreground)]">
              {widget.type} 即将推出
            </div>
          );
        }}
      />

      <AddServerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        groupId={addGroupId}
        onCreated={async () => {
          setAddOpen(false);
          setAddGroupId(null);
          await load();
        }}
      />

      <AddGroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        parentId={groupParentId}
        onCreated={async () => {
          setGroupOpen(false);
          setGroupParentId(null);
          await load();
        }}
      />

      <RenameGroupDialog
        open={renameOpen}
        groupId={renameGroupId}
        initialName={renameGroupName}
        onOpenChange={setRenameOpen}
        onRenamed={async () => {
          setRenameOpen(false);
          setRenameGroupId(null);
          setRenameGroupName("");
          await load();
        }}
      />
    </div>
  );
}
