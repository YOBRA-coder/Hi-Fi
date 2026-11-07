import { getSettings } from "./settings.server";
import { hasFreshContext } from "./hardware";

export const AWAY_BLOCK_MESSAGE =
  "Connect to the Wi-Fi first, then open the login page and try again. Your package starts as soon as you are connected.";

/**
 * One rule for every way of getting a package (M-Pesa, voucher, loyalty points): is this
 * phone at the router? Per the "pay away" setting a phone that is not here is either
 * blocked or its package is parked until it arrives (away = true).
 */
export async function awayGate(token: string | null | undefined): Promise<{ blocked: boolean; away: boolean }> {
  const settings = await getSettings();
  if (settings.payAwayMode === "off") return { blocked: false, away: false };
  if (await hasFreshContext(token)) return { blocked: false, away: false };
  return settings.payAwayMode === "block" ? { blocked: true, away: false } : { blocked: false, away: true };
}
