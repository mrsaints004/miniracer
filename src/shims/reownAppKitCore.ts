/**
 * Minimal shim for optional @reown/appkit/core imports that ships with the
 * latest WalletConnect provider. We don't bundle AppKit, so trying to use it
 * should surface an explicit error instead of breaking the build.
 */
export const createAppKit = () => {
  throw new Error(
    "Reown AppKit is not installed. Please add @reown/appkit if you need AppKit features."
  );
};
