/** One line in the dashboard's bell: something that happened, and where to deal with it. */
export type InboxItem = {
  id: string;
  kind: "order" | "review" | "stock";
  title: string;
  detail: string;
  /** When it happened; stock items use the time of the check. */
  at: string;
  href: string;
};
