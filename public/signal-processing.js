/**
 * Computes factorial of a non-negative integer `n`.
 * @param {number} n
 * @returns {number}
 */
function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Generates an approximation of the exponential function using a Taylor series.
 * Precomputes coefficients for efficiency.
 *
 * @param {number} termCount
 * @returns {(x: number) => number}
 */
export function generateExpApproximation(termCount) {
  // Precompute coefficients: 1 / n!
  const coefficients = Array.from({ length: termCount }, (_, n) => 1 / factorial(n));

  // Return a closure that evaluates the polynomial
  return function(x) {
    let result = 0;
    let power = 1; // x^0
    for (let n = 0; n < termCount; n++) {
      result += coefficients[n] * power;
      power *= x;
    }
    return result;
  };
}