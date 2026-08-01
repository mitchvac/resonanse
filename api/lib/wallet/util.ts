/**
 * Integer micro-unit helpers. All coin/price math stays in integers; these
 * helpers only convert to fixed-decimal STRINGS at the boundary (chain amounts,
 * reward amounts) so no float drift ever enters the ledger.
 */

/** Number of 1e-6 sub-units per whole unit. */
const MICRO = 1_000_000;

/**
 * Convert an integer count of 1e-`scale` units into a fixed-decimal string.
 * e.g. microToDecimalString(19_980_000, 6) === "19.980000".
 */
export function unitsToDecimalString(units: number, scale: number): string {
  const negative = units < 0;
  const abs = Math.abs(Math.trunc(units));
  const base = 10 ** scale;
  const whole = Math.floor(abs / base);
  const frac = abs % base;
  const fracStr = frac.toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fracStr}`;
}

/** Convert micro (1e-6) units → 6-decimal string. */
export function microToDecimalString(micro: number): string {
  return unitsToDecimalString(micro, 6);
}

/**
 * Quote an on-chain amount (in 1e-`assetScale` sub-units) for a USD value,
 * given the asset's USD reference rate in micro-USD per whole unit.
 * Pure integer math: floor( usdMicro * 10^assetScale / rateUsdMicro ).
 */
export function quoteAssetSubUnits(
  usdMicro: number,
  rateUsdMicro: number,
  assetScale: number,
): number {
  const numerator = usdMicro * 10 ** assetScale;
  return Math.floor(numerator / rateUsdMicro);
}

/** Convert a USD micro value and an asset rate into a decimal amount string. */
export function quoteAssetAmountText(
  usdMicro: number,
  rateUsdMicro: number,
  assetScale: number,
): string {
  const subUnits = quoteAssetSubUnits(usdMicro, rateUsdMicro, assetScale);
  return unitsToDecimalString(subUnits, assetScale);
}

/** Percentage (0–1) of a micro-USD value, rounded to the nearest micro. */
export function percentOfMicro(usdMicro: number, percent: number): number {
  // Multiply by an integer ratio to avoid floats: percent * 1e6 then /1e6.
  return Math.round((usdMicro * Math.round(percent * MICRO)) / MICRO);
}

/** Scale a micro-USD value into an asset's decimal amount string. */
export function usdMicroToAssetText(
  usdMicro: number,
  rateUsdMicro: number,
  assetScale: number,
): string {
  return quoteAssetAmountText(usdMicro, rateUsdMicro, assetScale);
}

/**
 * Parse a non-negative decimal string into an integer count of 1e-`scale`
 * sub-units (pure string math, no floats). e.g. ("19.98", 6) → 19980000.
 * Extra fractional digits beyond `scale` are truncated.
 */
export function decimalStringToSubUnits(text: string, scale: number): number {
  const [wholePart, fracPart = ""] = text.trim().split(".");
  const whole = wholePart.replace(/[^0-9]/g, "") || "0";
  const frac = (fracPart.replace(/[^0-9]/g, "") + "0".repeat(scale)).slice(
    0,
    scale,
  );
  return Number(whole) * 10 ** scale + Number(frac || "0");
}
