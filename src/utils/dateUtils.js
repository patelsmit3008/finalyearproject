/**
 * Calculate years of experience from a join date.
 * @param {string|Date|null|undefined} joinDate - Join date (ISO string or Date)
 * @returns {number} Years (1 decimal), or 0 if invalid/missing
 */
export function calculateExperience(joinDate) {
  if (joinDate == null) return 0;
  const join = new Date(joinDate);
  if (Number.isNaN(join.getTime())) return 0;
  const now = new Date();
  const diffTime = Math.abs(now - join);
  const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(diffYears * 10) / 10;
}
