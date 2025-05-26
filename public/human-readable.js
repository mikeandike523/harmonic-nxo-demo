/**
 * 
 * Formats a human-readable byte count using binary units (KiB, MiB, GiB, etc.)
 * 
 * @param {number} byteCount - The number of bytes.
 * @param {number} [decimalPlaces=undefined] - Number of decimal places to include in the output. If undefined, use full precision.
 * @returns {string} - Human-readable string (e.g., "1.23 MiB")
 */
export function formatHumanReadableByteCountBinary(byteCount, decimalPlaces) {
  if (byteCount < 0) {
    throw new Error("Byte count must be non-negative.");
  }

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
  let index = 0;
  let value = byteCount;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }

  const formattedValue =
    decimalPlaces ?? decimalPlaces === 0
      ? value.toFixed(decimalPlaces)
      : String(value);

  return `${formattedValue} ${units[index]}`;
}