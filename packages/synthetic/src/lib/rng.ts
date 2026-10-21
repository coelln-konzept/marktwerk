import { base, de, en, Faker } from "@faker-js/faker";

/** Seeded random source. Every random decision in the generator goes through one instance. */
export interface Rng {
  /** Faker instance with the German locale stack (the same stack as `fakerDE`), seeded. */
  readonly faker: Faker;
  uuid(): string;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Integer in [min, max] that is a multiple of `step`. */
  stepped(min: number, max: number, step: number): number;
  /** Float in [0, 1). */
  unit(): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  pickWeighted<T>(entries: readonly { value: T; weight: number }[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  const faker = new Faker({ locale: [de, en, base] });
  faker.seed(seed);

  const int = (min: number, max: number): number => faker.number.int({ min, max });
  const unit = (): number => int(0, 999_999) / 1_000_000;

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick() called with an empty list");
    const item = items[int(0, items.length - 1)];
    if (item === undefined) throw new Error("pick() index out of range");
    return item;
  }

  function pickWeighted<T>(entries: readonly { value: T; weight: number }[]): T {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = unit() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll < 0) return entry.value;
    }
    const last = entries[entries.length - 1];
    if (last === undefined) throw new Error("pickWeighted() called with an empty list");
    return last.value;
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      const a = out[i];
      const b = out[j];
      if (a === undefined || b === undefined) throw new Error("shuffle() index out of range");
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  return {
    faker,
    uuid: () => faker.string.uuid(),
    int,
    stepped: (min, max, step) => min + int(0, Math.floor((max - min) / step)) * step,
    unit,
    chance: (probability) => unit() < probability,
    pick,
    pickWeighted,
    shuffle,
  };
}
