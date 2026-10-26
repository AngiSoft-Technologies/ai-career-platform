"use client";

import { ReactNode } from "react";
import { MarketingNav } from "./nav";
import { MarketingFooter } from "./footer";

interface MarketingLayoutProps {
  children: ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="mk-root">
      <MarketingNav />
      <main id="main-content">{children}</main>
      <MarketingFooter />
    </div>
  );
}