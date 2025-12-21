import type { Ref } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import styles from "./sidebar.module.css";
import type { Note } from "../types/note";

type SidebarProps = {
  notes: Note[];
  selectedPath: string;
  onSelectPath: (path: string) => void;
  onImportMarkdown: () => void;
  onExportMarkdown: () => void;
  onDeleteNote: (path: Note["path"]) => void;
  pendingDeletePath?: string | null;
  onCancelDelete?: () => void;
  onConfirmDelete?: () => void;
};

type ContextMenuState = {
  path: string;
  x: number;
  y: number;
};

/**
 * ノート一覧やインポート/エクスポート操作をまとめたサイドバーを描画する。
 *
 * @param props.notes 一覧表示するノートコレクション
 * @param props.selectedPath 現在開いているノートパス
 * @param props.onSelectPath ノート項目をクリックした際の遷移ハンドラ
 * @param props.onImportMarkdown ディレクトリインポート実行コールバック
 * @param props.onExportMarkdown ディレクトリエクスポート実行コールバック
 * @param props.onDeleteNote ノート削除処理を依頼するハンドラ
 * @param props.pendingDeletePath 削除保留中のノートパス（なければnull/undefined）
 * @param props.onCancelDelete Undoバーから削除を取り消すコールバック
 * @param props.onConfirmDelete Undoバーから削除を実行するコールバック
 * @returns サイドバーUIのJSX
 */
export function Sidebar(props: SidebarProps) {
  const contextMenu = useSidebarContextMenu(props.onSelectPath, props.onDeleteNote);
  return (
    <nav class={styles.sidebar} ref={contextMenu.containerRef}>
      <SidebarHeader onImport={props.onImportMarkdown} onExport={props.onExportMarkdown} />
      <SidebarList
        notes={props.notes}
        selectedPath={props.selectedPath}
        onSelectPath={props.onSelectPath}
        onContextMenu={contextMenu.handleContextMenu}
      />
      {props.pendingDeletePath ? (
        <PendingDeletionBar
          path={props.pendingDeletePath}
          onConfirm={props.onConfirmDelete ?? (() => {})}
          onCancel={props.onCancelDelete ?? (() => {})}
        />
      ) : null}
      {contextMenu.contextMenu ? (
        <SidebarContextMenu
          innerRef={contextMenu.menuRef}
          position={contextMenu.contextMenu}
          onOpen={contextMenu.handleMenuOpen}
          onDelete={contextMenu.handleMenuDelete}
        />
      ) : null}
    </nav>
  );
}

function SidebarHeader({ onImport, onExport }: { onImport: () => void; onExport: () => void }) {
  return (
    <header class={styles.sidebarHeader}>
      <h2 class={styles.sidebarTitle}>Notes</h2>
      <div class={styles.sidebarActions}>
        <button type="button" class={styles.sidebarActionButton} onClick={onImport}>
          Import
        </button>
        <button type="button" class={styles.sidebarActionButton} onClick={onExport}>
          Export
        </button>
      </div>
    </header>
  );
}

type PendingDeletionBarProps = {
  path: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function PendingDeletionBar({ path, onConfirm, onCancel }: PendingDeletionBarProps) {
  return (
    <div class={styles.confirmDeletionBar} role="alert">
      <span class={styles.confirmDeletionLabel}>Are you sure you want to delete "{path}"?</span>
      <div class={styles.confirmDeletionActions}>
        <button
          type="button"
          class={`${styles.confirmDeletionButton} ${styles.confirmDeletionButtonConfirm}`}
          onClick={onConfirm}
        >
          Delete
        </button>
        <button
          type="button"
          class={`${styles.confirmDeletionButton} ${styles.confirmDeletionButtonCancel}`}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type SidebarContextMenuProps = {
  position: ContextMenuState;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
};

type SidebarListProps = {
  notes: Note[];
  selectedPath: string;
  onSelectPath: (path: string) => void;
  onContextMenu: (event: MouseEvent, path: string) => void;
};

function SidebarList({ notes, selectedPath, onSelectPath, onContextMenu }: SidebarListProps) {
  const partitions = partitionNotes(notes);
  return (
    <div class={styles.sidebarLists}>
      <SidebarListSection
        title="Recently Updated"
        notes={partitions.recent}
        selectedPath={selectedPath}
        onSelectPath={onSelectPath}
        onContextMenu={onContextMenu}
        keyPrefix="recent"
      />
      <SidebarListSection
        title="All Notes"
        notes={partitions.remaining}
        selectedPath={selectedPath}
        onSelectPath={onSelectPath}
        onContextMenu={onContextMenu}
        keyPrefix="all"
      />
    </div>
  );
}

function SidebarListSection({
  title,
  notes,
  selectedPath,
  onSelectPath,
  onContextMenu,
  keyPrefix,
}: {
  title: string;
  notes: Note[];
  selectedPath: string;
  onSelectPath: (path: string) => void;
  onContextMenu: (event: MouseEvent, path: string) => void;
  keyPrefix: string;
}) {
  return (
    <section>
      <h3 class={styles.sidebarSectionTitle}>{title}</h3>
      <ul class={styles.sidebarList}>
        {notes.map((note) => (
          <li key={`${note.path}::${keyPrefix}`}>
            <button
              type="button"
              class={
                note.path === selectedPath
                  ? `${styles.sidebarItem} ${styles.sidebarItemActive}`
                  : styles.sidebarItem
              }
              onClick={() => onSelectPath(note.path)}
              onContextMenu={(event) => onContextMenu(event as MouseEvent, note.path)}
            >
              <span>{note.title || note.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function partitionNotes(notes: Note[]) {
  const sorted = [...notes].sort((a, b) => a.title.localeCompare(b.title));
  const recent = [...notes]
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 5);
  const recentPaths = new Set(recent.map((note) => note.path));
  const remaining = sorted.filter((note) => !recentPaths.has(note.path));
  return { recent, remaining };
}

function SidebarContextMenu({
  position,
  onOpen,
  onDelete,
  innerRef,
}: SidebarContextMenuProps & { innerRef: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={innerRef}
      class={styles.contextMenu}
      style={{ top: `${position.y}px`, left: `${position.x}px` }}
      role="menu"
    >
      <button type="button" class={styles.contextMenuItem} onClick={() => onOpen(position.path)}>
        Open
      </button>
      <button
        type="button"
        class={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
        onClick={() => onDelete(position.path)}
      >
        Delete
      </button>
    </div>
  );
}

function useSidebarContextMenu(onOpen: (path: string) => void, onDelete: (path: string) => void) {
  const containerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      closeContextMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu, closeContextMenu]);

  const handleContextMenu = useCallback(
    (event: MouseEvent, path: string) => {
      event.preventDefault();
      event.stopPropagation();
      const containerBounds = containerRef.current?.getBoundingClientRect();
      const relativeX = containerBounds ? event.clientX - containerBounds.left : event.clientX;
      const relativeY = containerBounds ? event.clientY - containerBounds.top : event.clientY;
      const maxX = Math.max(0, (containerBounds?.width ?? window.innerWidth) - 200);
      const maxY = Math.max(0, (containerBounds?.height ?? window.innerHeight) - 120);
      const clampedX = Math.max(0, Math.min(relativeX, maxX));
      const clampedY = Math.max(0, Math.min(relativeY, maxY));
      setContextMenu({ path, x: clampedX, y: clampedY });
    },
    [closeContextMenu],
  );

  const handleMenuOpen = useCallback(
    (path: string) => {
      closeContextMenu();
      onOpen(path);
    },
    [closeContextMenu, onOpen],
  );

  const handleMenuDelete = useCallback(
    (path: string) => {
      closeContextMenu();
      onDelete(path);
    },
    [closeContextMenu, onDelete],
  );

  return {
    containerRef,
    menuRef,
    contextMenu,
    handleContextMenu,
    handleMenuOpen,
    handleMenuDelete,
  };
}
