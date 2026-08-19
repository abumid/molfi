/**
 * Online payment.
 *
 * Click and Payme are not connected yet. While the flag is off the wallet does
 * not pretend the buttons work: it says plainly that the method is coming and
 * offers a working path — message us on Telegram and the balance is topped up
 * by hand from the admin panel. A button that silently does nothing is worse
 * than no button: the person thinks the app is broken and leaves.
 *
 * When the gateways arrive: set PAYMENTS_LIVE = true and wire the handlers in
 * Wallet.jsx. Nothing else in the interface needs to change.
 */
export const PAYMENTS_LIVE = false

/** Where to go for a manual top-up or withdrawal while there are no gateways. */
export const SUPPORT_TELEGRAM = 'https://t.me/molfi_bot'
