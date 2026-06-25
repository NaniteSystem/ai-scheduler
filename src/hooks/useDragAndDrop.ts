import { useState, useCallback } from 'react';

export function useDragAndDrop<T extends { id: string }>(
  initialItems: T[],
  onReorder: (items: T[]) => void
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDragStart = useCallback((id: string) => {
    setDragId(id);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverId(id);
  }, []);

  const onDragEnd = useCallback(() => {
    setDragId(null);
    setOverId(null);
  }, []);

  const onDrop = useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const items = [...initialItems];
    const dragIdx = items.findIndex(i => i.id === dragId);
    const targetIdx = items.findIndex(i => i.id === targetId);
    if (dragIdx < 0 || targetIdx < 0) return;
    const [moved] = items.splice(dragIdx, 1);
    items.splice(targetIdx, 0, moved);
    onReorder(items);
    setDragId(null);
    setOverId(null);
  }, [dragId, initialItems, onReorder]);

  return { dragId, overId, onDragStart, onDragOver, onDragEnd, onDrop };
}
