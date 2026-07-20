import type { Habit, HabitGroup } from '../types.ts';

/** Remove a group without deleting the independently managed habits inside it. */
export function removeHabitGroup(
  habitGroups: HabitGroup[],
  habits: Habit[],
  groupId: string,
): { habitGroups: HabitGroup[]; habits: Habit[] } {
  return {
    habitGroups: habitGroups.filter(group => group.id !== groupId),
    habits: habits.map(habit => habit.groupId === groupId ? { ...habit, groupId: undefined } : habit),
  };
}
