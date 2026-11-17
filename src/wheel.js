// Seven equal scoring wedges, translated together by the hidden spin.
export const WHEEL_ZONES = [
  { from: -14, to: -10, points: 1, color: "#e7b39a" },
  { from: -10, to: -6, points: 2, color: "#e8cf91" },
  { from: -6, to: -2, points: 3, color: "#aebf9b" },
  { from: -2, to: 2, points: 4, color: "#647953" },
  { from: 2, to: 6, points: 3, color: "#aebf9b" },
  { from: 6, to: 10, points: 2, color: "#e8cf91" },
  { from: 10, to: 14, points: 1, color: "#e7b39a" },
];
export function wheelPoints(target, guess) {
  const gap = Math.abs(target - guess);
  return gap <= 2 ? 4 : gap <= 6 ? 3 : gap <= 10 ? 2 : gap <= 14 ? 1 : 0;
}
export const spinTarget = () =>
  14 + (crypto.getRandomValues(new Uint32Array(1))[0] % 73);
