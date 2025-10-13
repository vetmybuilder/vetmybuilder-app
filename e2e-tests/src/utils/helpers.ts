// helpers
export function randomOf<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function companyLabel(i: number) {
  // “Builder A”, “Builder B”, … cycling through A–Z
  const letter = String.fromCharCode(65 + (i % 26));
  return `Builder ${letter}`;
}

export function phoneFor(i: number) {
  // keep the same shape, nudge last 2–3 digits to ensure uniqueness
  const suffix = (100 + (i % 900)).toString(); // 100..999
  return `0207123${suffix}`;
}
