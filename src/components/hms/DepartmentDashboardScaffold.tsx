import Link from "next/link";
import { HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import type { HmsMeaning } from "@/components/hms/meaning";

/**
 * Placeholder for a department that isn't built yet (maintenance, HR, revenue). It never
 * shows figures: there is no data behind these departments, so any number would mislead.
 */
export default function DepartmentDashboardScaffold({
  title,
  subtitle,
  comingSoon,
  settingsHref,
  meaning = "neutral",
}: {
  title: string;
  subtitle: string;
  /** One line on what the department will do once it's built. */
  comingSoon: string;
  /** The department's settings page, which lists what's planned. */
  settingsHref: string;
  /** The department's own colour, used for the heading accent. */
  meaning?: HmsMeaning;
}) {
  return (
    <HmsPage>
      <HmsPageHeader title={title} description={subtitle} meaning={meaning} />
      <HmsEmptyState
        art="page"
        meaning={meaning}
        title="Coming soon"
        description={comingSoon}
        action={
          <Link href={settingsHref} className={hmsButton.secondary}>
            See what&apos;s planned
          </Link>
        }
      />
    </HmsPage>
  );
}
