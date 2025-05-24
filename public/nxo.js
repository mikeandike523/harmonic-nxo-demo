export function normalizeNXODef(def) {
  let total = 0;

  for (const { amplitude } of Object.values(def)) {
    total += amplitude;
  }

  return Object.fromEntries(
    Object.entries(def).map(
      ([harmonic, { amplitude, sustainAmplitude, ...rest }]) => {
        return [
          harmonic,
          {
            ...rest,
            amplitude: amplitude / total,
            sustainAmplitude: sustainAmplitude / total,
          },
        ];
      }
    )
  );
}