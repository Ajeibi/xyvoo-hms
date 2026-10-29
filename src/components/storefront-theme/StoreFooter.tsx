import Link from "next/link";
import { getShopT } from "@/lib/store/i18n/server";
import { menuItemPath, storeHref } from "@/lib/store/site/links";
import type { Storefront } from "@/lib/store/site/storefront";
import StoreApp, { type StoreAppConfig } from "./StoreApp";
import { CookieSettingsButton } from "./StoreAnalytics";
import { storeSocialLinks } from "./socials";
import { StoreLogo } from "./StoreHeader";

export default function StoreFooter({ storefront, showMark, appConfig = null }: { storefront: Storefront; showMark: boolean; appConfig?: StoreAppConfig | null }) {
  const { site, storeName, basePath } = storefront;
  const socials = storeSocialLinks(storefront);
  const t = getShopT(storefront);

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <StoreLogo storeName={storeName} homeHref={storeHref(basePath, "/")} logoUrl={site.brand.logoUrl} logoAlt={site.brand.logoAlt} showMark={showMark} />
            {site.content.footerBlurb ? <p>{site.content.footerBlurb}</p> : null}
            {socials.length ? (
              <ul className="social">
                {socials.map((s) => (
                  <li key={s.href}>
                    <a className="icon-btn" href={s.href} aria-label={t("chrome.socialLink", { store: storeName, network: s.label })} rel="noopener noreferrer" target="_blank">
                      {s.icon}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {site.navigation.footer.map((column, i) => (
            <nav className="footer-col" aria-labelledby={`f-col-${i}`} key={column.title + i}>
              <h2 id={`f-col-${i}`}>{column.title}</h2>
              <ul>
                {column.items.map((item) => {
                  const path = menuItemPath(item);
                  return path ? (
                    <li key={item.label + path}>
                      <Link href={storeHref(basePath, path)}>{item.label}</Link>
                    </li>
                  ) : null;
                })}
              </ul>
            </nav>
          ))}
        </div>
        {appConfig ? <StoreApp config={appConfig} variant="footer" /> : null}
        <div className="footer-bottom">
          <p>{site.content.copyright}</p>
          {appConfig ? <CookieSettingsButton /> : null}
        </div>
      </div>
    </footer>
  );
}
