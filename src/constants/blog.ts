import type { BlogPost } from "@/types/blog";

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-nigerian-hotels-are-cutting-check-in-time",
    title: "How Nigerian Hotels Are Cutting Check-in Time by 80%",
    excerpt:
      "We analysed data from 200 hotels using XYVOO and found one common thread in the highest-performing properties.",
    category: "Operations",
    readTime: "5 min",
    date: "Apr 8, 2026",
    featured: true,
    color: "from-indigo-500 to-violet-600",
    author: "XYVOO Team",
    body: [
      {
        type: "p",
        text: "Across the 200 properties we looked at, the gap between the fastest and slowest front desks wasn't down to staff, and it wasn't down to how busy the hotel was on a given day. It came down to one thing: how much of the check-in had already happened before the guest reached the desk.",
      },
      {
        type: "p",
        text: "The hotels in the fastest 20% weren't doing anything exotic. They were pre-assigning rooms the night before, capturing ID and payment details at the time of booking rather than at arrival, and giving the front desk a single screen instead of three. None of that requires new hardware. It requires the front desk system to actually hold the data the reservation already generated, and hand it back at the right moment.",
      },
      { type: "h2", text: "What the slow 20% had in common" },
      {
        type: "p",
        text: "The slower properties almost always had the same pattern: a reservation system that didn't talk to the payment terminal, a housekeeping board that lived on a whiteboard, and a front desk agent who had to ask the guest questions the hotel already had the answers to. Every one of those is a small delay on its own. Stacked together, on a Friday evening with six guests in the queue, they add up to a genuinely bad first impression.",
      },
      {
        type: "quote",
        text: "\"We didn't hire anyone new. We just stopped asking guests for information we already had.\" (Front office manager, 44-room property, Lagos)",
      },
      { type: "h2", text: "The three changes that moved the needle most" },
      {
        type: "list",
        items: [
          "Pre-assigning rooms the night before, so front desk isn't waiting on a housekeeping update while a guest watches.",
          "Capturing payment details at the time of booking for direct reservations, so check-in becomes a confirmation, not a data-entry exercise.",
          "Putting reservations, room status and folio on one screen, so the agent isn't switching between systems mid-conversation.",
        ],
      },
      {
        type: "p",
        text: "None of these are large investments. They're mostly about making sure the system you already have is actually being used to its full extent, and that the front desk isn't re-typing something a guest already told you three weeks ago when they booked.",
      },
      {
        type: "p",
        text: "If you want a fuller, step-by-step version of this, we've put together a free front desk efficiency checklist covering all four moments (before arrival, at arrival, during the stay, and at departure) that you can download and run against your own property this week.",
      },
      { type: "resource", slug: "front-desk-efficiency-checklist" },
    ],
  },
  {
    slug: "hoteliers-guide-to-revenue-management-2026",
    title: "The Hotelier's Guide to Revenue Management in 2026",
    excerpt:
      "ADR, RevPAR, occupancy rate: what they mean, how to improve them, and why every independent hotel should be tracking them.",
    category: "Revenue",
    readTime: "8 min",
    date: "Apr 5, 2026",
    featured: false,
    color: "from-emerald-500 to-teal-600",
    author: "XYVOO Team",
    body: [
      {
        type: "p",
        text: "Revenue management has a reputation for being something only large chains do, with a dedicated analyst and a wall of dashboards. In practice, the core of it is three numbers, and any independent hotel can start tracking them this week with nothing more than a spreadsheet, though a system that calculates them for you removes the risk of doing it wrong.",
      },
      { type: "h2", text: "Occupancy, ADR, and the number that ties them together" },
      {
        type: "p",
        text: "Occupancy rate tells you how full you were. Average Daily Rate (ADR) tells you what you charged for the rooms you sold, ignoring the empty ones entirely. Neither number on its own tells the whole story. A hotel can be fully booked at a low rate, or half-empty at a high one, and land on the same revenue either way. Revenue Per Available Room (RevPAR) is what closes that gap: it's ADR multiplied by occupancy, and it's the one figure that lets you compare a slow Tuesday to a busy Saturday fairly.",
      },
      {
        type: "p",
        text: "Once you're tracking RevPAR weekly rather than glancing at a monthly total, patterns start to show up that a single average would hide entirely: a specific weekday that consistently underperforms, or a slow, steady decline that a strong weekend was masking.",
      },
      { type: "h2", text: "Small, frequent rate moves beat one big seasonal jump" },
      {
        type: "list",
        items: [
          "Raise rates in small steps as occupancy climbs for a given date, rather than waiting for a seasonal cutover.",
          "Use a minimum length of stay around known high-demand dates instead of relying on rate alone.",
          "Offer a modest early-booking discount for dates far out, then let rate rise as the room becomes scarce.",
        ],
      },
      {
        type: "p",
        text: "The instinct when a week looks soft is to drop the rate. It works, but it's the most expensive lever available, because the discount applies to every room you would have sold anyway at the higher price. A minimum-stay adjustment or an added-value package (a free breakfast rather than a lower headline rate) often protects revenue better while still filling the room.",
      },
      {
        type: "p",
        text: "We've written a longer field guide with a full worked example (a 40-room property, one Saturday night, walked through occupancy, ADR and RevPAR step by step) if you want something to sit down with and apply directly to your own numbers.",
      },
      { type: "resource", slug: "hotel-revenue-management-field-guide" },
    ],
  },
  {
    slug: "front-desk-software-costing-repeat-guests",
    title: "Why Your Front Desk Software is Costing You Repeat Guests",
    excerpt:
      "The link between slow check-in systems and lower guest retention is more direct than most hoteliers realise.",
    category: "Guest Experience",
    readTime: "4 min",
    date: "Apr 1, 2026",
    featured: false,
    color: "from-amber-500 to-orange-600",
    author: "XYVOO Team",
    body: [
      {
        type: "p",
        text: "Guests rarely mention the front desk in a review unless something went wrong there. That silence is deceptive: a slow, clunky check-in doesn't usually generate a complaint, it generates a guest who quietly books elsewhere next time, or books through an OTA instead of direct, because the friction of dealing with your system directly wasn't worth the saving.",
      },
      { type: "h2", text: "The moment that sets the tone for the whole stay" },
      {
        type: "p",
        text: "Psychologically, guests judge a stay heavily on its first and last five minutes. A hotel can have excellent rooms and a genuinely warm team, and still leave a guest with a lukewarm overall impression if check-in took twelve minutes of screen-switching and re-typing information they'd already given at booking.",
      },
      {
        type: "quote",
        text: "\"The room was lovely. Getting into it wasn't.\" This is an actual line from a three-star review we came across while researching this piece.",
      },
      { type: "h2", text: "It compounds at checkout too" },
      {
        type: "p",
        text: "The same friction shows up in reverse at departure: a guest who has to wait at the desk while incidental charges are reconciled by hand is leaving with that as their last memory of the stay, not the room or the staff. Express checkout, where the folio is settled automatically and emailed, removes that entirely, and it's one of the cheapest guest-experience improvements a hotel can make.",
      },
      {
        type: "p",
        text: "None of this needs a lobby redesign or a bigger team. It needs the software behind the desk to actually hold what it already knows about the guest, and hand it back at the right moment instead of asking for it again.",
      },
      { type: "resource", slug: "front-desk-efficiency-checklist" },
    ],
  },
  {
    slug: "paystack-for-hotels-integration-guide",
    title: "Paystack for Hotels: A Complete Integration Guide",
    excerpt:
      "Everything you need to know about accepting card payments, managing refunds, and reconciling hotel transactions.",
    category: "Finance",
    readTime: "10 min",
    date: "Mar 28, 2026",
    featured: false,
    color: "from-pink-500 to-rose-600",
    author: "XYVOO Team",
    body: [
      {
        type: "p",
        text: "Most of the hotels we talk to already use Paystack for something, whether that's a website deposit form, an invoice link, or a card machine at the desk. Far fewer have it properly wired into the front desk itself, which means someone is manually copying a payment reference from one system into another, or worse, trusting that two separate totals happen to agree at month-end.",
      },
      { type: "h2", text: "What 'properly integrated' actually means" },
      {
        type: "p",
        text: "A genuine integration means a payment taken against a guest's folio posts there directly, with no manual entry and no separate export to reconcile later. It means a refund processed through Paystack updates the folio the same day, not whenever someone remembers to check. And it means your finance team can pull a settlement report and match it against your booking system's totals in minutes, not hours.",
      },
      { type: "h2", text: "The three kinds of mismatch you'll actually see" },
      {
        type: "list",
        items: [
          "Timing differences: a payment taken late on a Sunday settles on Tuesday, so it's in one week's folio total and the next week's settlement. Not an error, just a timing gap.",
          "Fee differences: Paystack's percentage fee is deducted before settlement, so a folio showing the gross amount won't match a settlement showing net, until you reconcile against gross and check the fee separately.",
          "Genuine mismatches: a refund processed in Paystack but never applied to the folio, or a payment posted to the wrong room. This is the only category that actually needs investigating.",
        ],
      },
      {
        type: "p",
        text: "The habit that fixes most reconciliation headaches before they start is simple: apply a refund to the folio the same day it's processed in Paystack. Almost every 'reconciliation nightmare' we've seen traced back to that one habit slipping for a few weeks.",
      },
      {
        type: "p",
        text: "We've written a more detailed reconciliation guide with a full weekly routine, plus a five-minute month-end check, if you want to put a proper process around this rather than reconciling from memory.",
      },
      { type: "resource", slug: "paystack-reconciliation-guide-for-hotels" },
    ],
  },
  {
    slug: "housekeeping-efficiency-digital-transformation",
    title: "Housekeeping Efficiency: The Digital Transformation Most Hotels Miss",
    excerpt:
      "Paper-based housekeeping logs are killing your room turnaround time. Here's how top hotels have fixed it.",
    category: "Operations",
    readTime: "6 min",
    date: "Mar 22, 2026",
    featured: false,
    color: "from-sky-500 to-blue-600",
    author: "XYVOO Team",
    body: [
      {
        type: "p",
        text: "Front desk software gets most of the attention in hotel technology conversations, but housekeeping is where a huge amount of quiet inefficiency actually lives. A paper log or a shared spreadsheet means a room's real-time status (dirty, in progress, inspected, ready) is only ever as current as the last time someone walked to the office to update it.",
      },
      { type: "h2", text: "The gap between 'clean' and 'known to be clean'" },
      {
        type: "p",
        text: "The room itself might be ready ten minutes after housekeeping finishes it. The front desk might not find that out for another half hour, because the update travels by word of mouth or a walk down the corridor rather than instantly. Multiply that gap across every room, every day, and it's a meaningful amount of sellable inventory sitting idle for no real reason.",
      },
      { type: "h2", text: "What changes when the front desk sees status live" },
      {
        type: "list",
        items: [
          "A room marked ready by housekeeping shows up at the front desk immediately, not after a phone call or a walk-through.",
          "Maintenance issues logged from a room can be seen by the right department without a guest having to ask twice.",
          "Supervisors can see which rooms are behind schedule during the day, rather than discovering it at 3pm when guests start arriving.",
        ],
      },
      {
        type: "p",
        text: "This doesn't require handing every housekeeper a tablet, though some properties do exactly that. Even a simple status update from a shared device at the end of each corridor closes most of the gap. The point isn't the hardware. It's making sure the front desk and housekeeping are looking at the same, current information instead of two versions of it that are minutes or hours apart.",
      },
    ],
  },
  {
    slug: "loyalty-programme-that-works-for-african-guests",
    title: "Building a Loyalty Programme That Actually Works for African Guests",
    excerpt:
      "Loyalty doesn't have to mean airline miles. We break down what genuinely drives repeat bookings in African hospitality.",
    category: "Guest Experience",
    readTime: "7 min",
    date: "Mar 18, 2026",
    featured: false,
    color: "from-violet-500 to-purple-600",
    author: "XYVOO Team",
    body: [
      {
        type: "p",
        text: "A lot of loyalty programme thinking is borrowed wholesale from global airline and hotel-chain models: points, tiers, a members' lounge. For an independent hotel or a small group, that model doesn't map well: the guest isn't flying forty segments a year with you, they might be staying three or four nights across an entire year. The mechanics need to fit the actual pattern of how people book.",
      },
      { type: "h2", text: "What actually drives a second booking" },
      {
        type: "p",
        text: "In conversations with guests across the properties we work with, the reasons for coming back rarely mentioned a points balance. They mentioned being remembered: a returning guest recognised at check-in, a preference noted from last time, a small gesture that acknowledged this wasn't their first stay. Loyalty, in this market, tends to be relational before it's transactional.",
      },
      {
        type: "quote",
        text: "\"I don't need a discount. I need them to remember I don't take the room near the lift.\" This is guest feedback shared with us by a partner hotel.",
      },
      { type: "h2", text: "A simpler model that fits" },
      {
        type: "list",
        items: [
          "Recognise a returning guest at the point of booking, not just at check-in. A small note or acknowledgement goes further than a generic discount.",
          "Keep genuine preferences on file (room location, dietary needs) and act on them without being asked twice.",
          "Reward direct bookings specifically: a modest, simple perk for booking without a third party, rather than a complex points system few guests will ever redeem.",
        ],
      },
      {
        type: "p",
        text: "The technical requirement behind all of this is smaller than it sounds: a guest profile that persists across stays, so 'this is their third visit' and 'they prefer a quiet room' are facts the system already holds, rather than something front desk has to remember personally or, more often, doesn't.",
      },
    ],
  },
];

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getRelatedBlogPosts(post: BlogPost, max = 3): BlogPost[] {
  const sameCategory = BLOG_POSTS.filter((p) => p.slug !== post.slug && p.category === post.category);
  const rest = BLOG_POSTS.filter((p) => p.slug !== post.slug && p.category !== post.category);
  return [...sameCategory, ...rest].slice(0, max);
}
