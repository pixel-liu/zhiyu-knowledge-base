"use client";

import { useEffect, useRef } from "react";

const EDGE_SIZE = 56;
const MAX_SPEED = 600; // Pixels per second.

export function useTreeDragAutoScroll(enabled: boolean) {
  const treeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const tree = treeRef.current;
    if (!enabled || !tree) return;

    let dragging = false;
    let pointer: { x: number; y: number } | null = null;
    let frame: number | null = null;
    let lastTime: number | null = null;

    const stopScrolling = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = null;
    };

    const getSpeed = () => {
      if (!pointer) return 0;
      const rect = tree.getBoundingClientRect();
      if (pointer.x < rect.left || pointer.x > rect.right || pointer.y < rect.top || pointer.y > rect.bottom) return 0;
      const edge = Math.min(EDGE_SIZE, rect.height / 3);
      if (edge <= 0) return 0;
      if (pointer.y < rect.top + edge) return -MAX_SPEED * (1 - (pointer.y - rect.top) / edge);
      if (pointer.y > rect.bottom - edge) return MAX_SPEED * (1 - (rect.bottom - pointer.y) / edge);
      return 0;
    };

    const scroll = (time: number) => {
      frame = null;
      const speed = getSpeed();
      const canScroll = speed < 0 ? tree.scrollTop > 0 : tree.scrollTop < tree.scrollHeight - tree.clientHeight;
      if (!dragging || !speed || !canScroll) {
        stopScrolling();
        return;
      }
      const elapsed = lastTime === null ? 1000 / 60 : Math.min(time - lastTime, 50);
      tree.scrollTop += speed * elapsed / 1000;
      lastTime = time;
      frame = requestAnimationFrame(scroll);
    };

    const startDrag = () => { dragging = true; };
    const trackDrag = (event: DragEvent) => {
      if (!dragging) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!getSpeed()) stopScrolling();
      else if (frame === null) frame = requestAnimationFrame(scroll);
    };
    const endDrag = () => {
      dragging = false;
      pointer = null;
      stopScrolling();
    };
    const leaveTree = (event: DragEvent) => {
      if (!tree.contains(event.relatedTarget as Node | null)) {
        // Browsers can omit relatedTarget when moving between rows.
        // Use the pointer bounds so these transitions do not interrupt scrolling.
        trackDrag(event);
      }
    };
    const onVisibilityChange = () => { if (document.hidden) endDrag(); };

    // Capture sees row events even when the drop target stops propagation.
    tree.addEventListener("dragstart", startDrag, true);
    tree.addEventListener("dragleave", leaveTree);
    document.addEventListener("dragover", trackDrag, true);
    document.addEventListener("drop", endDrag, true);
    document.addEventListener("dragend", endDrag, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", endDrag);
    return () => {
      endDrag();
      tree.removeEventListener("dragstart", startDrag, true);
      tree.removeEventListener("dragleave", leaveTree);
      document.removeEventListener("dragover", trackDrag, true);
      document.removeEventListener("drop", endDrag, true);
      document.removeEventListener("dragend", endDrag, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", endDrag);
    };
  }, [enabled]);

  return treeRef;
}
