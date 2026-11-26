const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export function normalizeRuc(value: string): string {
  return value.replace(/\D/g, "");
}

export function rucCheckDigit(firstTen: string): number {
  if (!/^\d{10}$/.test(firstTen)) {
    throw new TypeError("Expected ten digits");
  }

  const sum = WEIGHTS.reduce(
    (total, weight, index) => total + Number(firstTen.charAt(index)) * weight,
    0,
  );
  const check = 11 - (sum % 11);

  if (check === 10) return 0;
  if (check === 11) return 1;
  return check;
}

export function isValidRuc(value: string): boolean {
  return (
    /^\d{11}$/.test(value) &&
    rucCheckDigit(value.slice(0, 10)) === Number(value[10])
  );
}
