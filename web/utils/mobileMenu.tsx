// web/utils/mobileMenu.tsx
//
// Tiny context + hook + provider that lets any page open the global
// MobileMenu. The menu itself is mounted once at the app root by
// `web/components/GlobalMobileMenu.tsx`; pages just call `openMenu()`
// from their burger button.
//
// We deliberately keep this provider state-only (no auth, no router) so
// it can wrap the entire app tree without pulling in heavy deps. The
// auth-derived props for <MobileMenu /> are computed by the host
// component that reads this context.
import * as React from "react";

type MobileMenuCtx = {
  open: boolean;
  openMenu: () => void;
  closeMenu: () => void;
};

const Ctx = React.createContext<MobileMenuCtx>({
  open: false,
  openMenu: () => {},
  closeMenu: () => {},
});

export function MobileMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo<MobileMenuCtx>(
    () => ({
      open,
      openMenu: () => setOpen(true),
      closeMenu: () => setOpen(false),
    }),
    [open],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMobileMenu() {
  return React.useContext(Ctx);
}
