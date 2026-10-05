import Link from "next/link";
import { menuItemPath, storeHref } from "@/lib/store/site/links";
import type { Storefront } from "@/lib/store/site/storefront";
import { Icon } from "./primitives";
import { storeSocialLinks } from "./socials";
import { StoreLogo } from "./StoreHeader";

export default function StoreFooter({ storefront, showMark }: { storefront: Storefront; showMark: boolean }) {
  const { site, storeName, basePath } = storefront;
  const socials = storeSocialLinks(storefront);

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
                    <a className="icon-btn" href={s.href} aria-label={`${storeName} on ${s.label}`} rel="noopener noreferrer" target="_blank">
                      <Icon name={s.icon} />
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
        <div className="footer-bottom">
          <p>{site.content.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
