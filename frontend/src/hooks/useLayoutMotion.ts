import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { shouldReduceScheduleMotion } from "@/lib/scheduleMotion";

type Position = { x: number; y: number; node: HTMLElement };
const easing = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Animate marked items between their old and new positions without moving layout. */
export function useLayoutMotion(
  root: RefObject<HTMLElement>,
  revision: string,
  duration = 240,
) {
  const previous = useRef<Map<string, Position> | null>(null);
  const previousWidth = useRef(0);
  const running = useRef(new Map<HTMLElement, Animation>());

  useEffect(() => {
    const animations = running.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    };
    const onPreferenceChange = () => {
      if (shouldReduceScheduleMotion()) cancel();
    };
    preference.addEventListener("change", onPreferenceChange);
    return () => {
      preference.removeEventListener("change", onPreferenceChange);
      cancel();
    };
  }, []);

  useLayoutEffect(() => {
    const container = root.current;
    if (!container || typeof container.animate !== "function") return;

    // Continue interrupted transitions from their current visual position.
    const origins = new Map(previous.current);
    for (const [key, position] of origins) {
      if (running.current.has(position.node) && position.node.isConnected) {
        const transform = new DOMMatrixReadOnly(
          getComputedStyle(position.node).transform,
        );
        origins.set(key, {
          ...position,
          x: position.x + transform.m41,
          y: position.y + transform.m42,
        });
      }
    }
    for (const animation of running.current.values()) animation.cancel();
    running.current.clear();

    const bounds = container.getBoundingClientRect();
    const next = new Map<string, Position>();
    for (const node of container.querySelectorAll<HTMLElement>(
      "[data-motion-key]",
    )) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      next.set(node.dataset.motionKey!, {
        x: rect.left - bounds.left,
        y: rect.top - bounds.top,
        node,
      });
    }
    const shouldAnimate =
      previous.current !== null &&
      Math.abs(previousWidth.current - bounds.width) < 1 &&
      !shouldReduceScheduleMotion();
    previous.current = next;
    previousWidth.current = bounds.width;
    if (!shouldAnimate) return;

    let entering = 0;
    for (const [key, position] of next) {
      const origin = origins.get(key);
      const dx = origin ? origin.x - position.x : 0;
      const dy = origin ? origin.y - position.y : 6;
      if (origin && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const frames: Keyframe[] = origin
        ? [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }]
        : [
            { opacity: 0, transform: "translateY(6px)" },
            { opacity: 1, transform: "none" },
          ];
      const animation = position.node.animate(frames, {
        duration: origin ? duration : 180,
        easing,
        delay: origin ? 0 : Math.min(entering++ * 20, 60),
        fill: "backwards",
      });
      running.current.set(position.node, animation);
      animation.onfinish = () => {
        if (running.current.get(position.node) === animation)
          running.current.delete(position.node);
      };
    }
  }, [root, revision, duration]);
}
