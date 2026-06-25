// Shared Framer Motion variants — mirrors the Figma "Redesign To-Do App" feel.
// Signature easing used across the project: cubic-bezier(0.22, 1, 0.36, 1).

export const EASE = [0.22, 1, 0.36, 1] as const;

// View / route transition (matches their MainLayout + Layout).
export const pageTransition = {
  initial: { opacity: 0, y: 15, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -15, scale: 0.98 },
  transition: { duration: 0.3, ease: EASE },
};

// Staggered list-item entrance. Pass the index for the cascade delay.
export const listItem = (i: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay: i * 0.06, ease: EASE },
});

// Progress-bar fill. Pass the target percentage.
export const fillBar = (pct: number, i = 0) => ({
  initial: { width: 0 },
  animate: { width: `${pct}%` },
  transition: { duration: 1, delay: 0.15 + i * 0.08, ease: EASE },
});

// Card hover lift (their StatCard interaction).
export const hoverLift = { whileHover: { y: -2, scale: 1.02 }, transition: { duration: 0.2, ease: EASE } };
