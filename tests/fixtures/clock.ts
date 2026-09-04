export const FIXED_NOW = new Date('2026-09-04T00:00:00.000Z')

export function advancingClock(start = FIXED_NOW) {
  let current = new Date(start)
  return {
    now: () => new Date(current),
    advance: (milliseconds: number) => {
      current = new Date(current.getTime() + milliseconds)
      return new Date(current)
    },
  }
}
