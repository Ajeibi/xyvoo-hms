export type XyvooFaq = {
  category: string;
  question: string;
  answer: string;
  keywords: string[];
};

export const XYVOO_FAQS: XyvooFaq[] = [
  // Category 1 — General / About XYVOO
  {
    category: "General / About XYVOO",
    question: "What is XYVOO?",
    keywords: ["what is xyvoo", "about xyvoo", "xyvoo platform", "what does xyvoo do", "overview", "introduction"],
    answer:
      "XYVOO is a multi-product business platform built for African businesses. It has two products: a Hotel Management System (HMS) for hospitality businesses, and a Store platform for online merchants. Both products are white-label - your business runs entirely under your own brand, not XYVOO's.",
  },
  {
    category: "General / About XYVOO",
    question: "Who is XYVOO built for?",
    keywords: ["who is xyvoo for", "target audience", "what kind of business", "suitable for", "right for me", "ideal customer"],
    answer:
      "XYVOO is built for two types of businesses. Hospitality operators - independent hotels, boutique hotels, resorts, serviced apartments, hotel chains, and multi-property groups. And online merchants - retailers, product businesses, and SMBs that want a branded online store with a full operational dashboard.",
  },
  {
    category: "General / About XYVOO",
    question: "Does XYVOO offer both a hotel system and an online store?",
    keywords: ["hotel and store", "both products", "hms and store", "two products", "what can xyvoo do", "products offered"],
    answer:
      "Yes. XYVOO has two separate products built on the same platform infrastructure. The HMS is built for hotels and hospitality operators. The Store is built for online merchants and retailers. You can use one or both depending on your business needs.",
  },
  {
    category: "General / About XYVOO",
    question: "Is XYVOO a Nigerian company?",
    keywords: ["nigeria", "where is xyvoo", "nigerian company", "african platform", "naira", "local", "lagos", "africa"],
    answer:
      "Yes. XYVOO is built for African businesses first. Pricing is in Naira, payment integrations include Paystack and Flutterwave, and the platform is designed around the operational realities of running a business in Nigeria and across Africa.",
  },
  {
    category: "General / About XYVOO",
    question: "Can I use XYVOO for both my hotel and my online store?",
    keywords: ["hotel and store together", "both products", "hospitality and retail", "combined", "gift shop", "resort boutique", "use both"],
    answer:
      "Yes. If you operate a hotel that also sells products - a gift shop, a resort boutique, or branded merchandise - you can run both on XYVOO. The HMS handles your hotel operations and the Store handles your retail side. Both operate under your brand.",
  },
  {
    category: "General / About XYVOO",
    question: "Does my staff see the XYVOO brand when they log in?",
    keywords: ["white label", "branding", "own brand", "staff experience", "xyvoo visible", "custom brand", "invisible", "branded system"],
    answer:
      "No. XYVOO is completely invisible to your staff and your customers. When your team logs into the system, they see your hotel's name, your logo, and your brand colours. XYVOO operates entirely in the background as the infrastructure powering your system.",
  },
  {
    category: "General / About XYVOO",
    question: "Is XYVOO a PWA? Can my staff install it on their phones?",
    keywords: ["pwa", "progressive web app", "install on phone", "mobile app", "download", "home screen", "android", "ios", "install app"],
    answer:
      "Yes. XYVOO is a Progressive Web App (PWA). Your staff can install it directly on their phones or tablets by visiting your system's URL and adding it to their home screen. No app store download is required. The installed app shows your business name and icon - not XYVOO's.",
  },
  {
    category: "General / About XYVOO",
    question: "What countries does XYVOO support?",
    keywords: ["countries", "supported countries", "international", "global", "where available", "africa", "west africa", "ghana", "kenya"],
    answer:
      "XYVOO is available to businesses across Africa and internationally. The platform supports multiple currencies, timezones, languages, and tax frameworks. Payment integrations include both African-focused providers like Paystack and Flutterwave and global providers like Stripe and Adyen.",
  },
  {
    category: "General / About XYVOO",
    question: "What languages does XYVOO support?",
    keywords: ["languages", "language support", "french", "arabic", "multilingual", "local language", "translation"],
    answer:
      "XYVOO V1 launches with support for 18 languages. Additional languages can be added based on demand. The system interface, guest-facing outputs, and email templates all support the configured language for each tenant.",
  },
  {
    category: "General / About XYVOO",
    question: "Can I customise how my system looks?",
    keywords: ["customise", "branding", "logo", "colours", "custom look", "white label", "design", "brand colours", "typography"],
    answer:
      "Yes. Every XYVOO tenant can configure their system with their own logo, primary brand colour, and hotel or store identity. The entire interface - dashboard, emails, receipts, PWA install icon, and guest-facing outputs - reflects your brand. XYVOO is never visible to your users.",
  },
  {
    category: "General / About XYVOO",
    question: "Does XYVOO have a mobile app?",
    keywords: ["mobile app", "app store", "google play", "apple store", "ios app", "android app", "download app"],
    answer:
      "XYVOO is a Progressive Web App (PWA) - it does not live in the App Store or Google Play. Instead, your staff and customers install it directly from the browser onto their home screen. It works like a native app - fast, offline-capable, and fully branded - without the friction of app store downloads or update approvals.",
  },
  {
    category: "General / About XYVOO",
    question: "Is XYVOO suitable for small businesses?",
    keywords: ["small business", "small hotel", "startup", "new business", "just starting", "small team", "solo", "affordable"],
    answer:
      "Yes. XYVOO is designed to scale from a small guesthouse or independent retailer all the way to a multi-property hotel chain or growing e-commerce brand. The system is the same regardless of your size - there are no feature restrictions based on how small or large your operation is.",
  },
  {
    category: "General / About XYVOO",
    question: "What makes XYVOO different from other hotel management systems?",
    keywords: ["different", "unique", "why xyvoo", "advantage", "better than", "what sets xyvoo apart", "xyvoo vs others"],
    answer:
      "Three things. First, XYVOO is fully white-label - your staff and guests never know XYVOO exists. Second, every tenant gets every feature from day one - no tiers, no feature gates. Third, XYVOO operates as part of your team - when you raise a support issue, the team goes directly into your system and fixes it. You do not troubleshoot alone.",
  },

  // Category 2 — Hotel Management System (HMS)
  {
    category: "Hotel Management System (HMS)",
    question: "What does the XYVOO HMS include?",
    keywords: ["hms features", "what is included", "hotel system features", "modules", "what do I get", "hotel management", "full system"],
    answer:
      "The XYVOO HMS includes 13 operational departments: Front Desk, Reservations, Housekeeping, Restaurant & Bar, Kitchen, Accounts & Finance, Maintenance, Procurement, Inventory, HR, Scheduling, Revenue Management, and Smart Access. Every hotel gets all departments from day one.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can I manage multiple hotel properties from one account?",
    keywords: ["multi property", "multiple hotels", "hotel group", "chain", "more than one property", "portfolio", "group management"],
    answer:
      "Yes. All properties sit under one XYVOO account with one billing relationship. Each property operates independently with its own room inventory, staff, and configuration. GMs can be scoped to a single property or given access across all properties from one login.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Does XYVOO connect to Booking.com, Expedia, and other OTAs?",
    keywords: ["booking.com", "expedia", "airbnb", "agoda", "ota", "channel manager", "online travel agency", "sync", "ota connection"],
    answer:
      "Yes. XYVOO connects to all major OTAs including Booking.com, Expedia, Airbnb, and Agoda. Availability and rates sync in real time - when a room is sold through any channel, it is removed from all others within 3 seconds. GDS connectivity via Amadeus, Sabre, and Travelport is also included.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Does XYVOO work if my internet goes down?",
    keywords: ["offline", "no internet", "connectivity", "outage", "offline mode", "network down", "still work", "power cut", "no connection"],
    answer:
      "Yes. The HMS is designed to be offline-first. The front desk and POS continue operating without internet for up to 24 hours. All offline actions are queued and automatically synced when connectivity returns. Your hotel cannot be stopped by a network outage.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can guests receive a digital key on their phone?",
    keywords: ["digital key", "mobile key", "room key", "phone key", "keyless", "smart lock", "guest key", "nfc", "bluetooth key"],
    answer:
      "Yes. When a guest checks in, a digital key is automatically sent to their phone. It works via NFC or Bluetooth, activates at check-in time, and expires automatically at check-out. The front desk can issue, revoke, or share keys remotely. XYVOO integrates with ASSA ABLOY, Dormakaba, and SALTO lock systems.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can the front desk lock and unlock rooms remotely?",
    keywords: ["remote lock", "unlock door", "door control", "smart lock", "front desk lock", "lock room", "access control", "remote access"],
    answer:
      "Yes. The front desk has a real-time door status board showing every room - locked, unlocked, or physically open. Any room can be locked or unlocked with one click. Bulk actions are available - lock an entire floor or trigger a property-wide lockdown in an emergency.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "What accounting systems does XYVOO connect to?",
    keywords: ["accounting", "xero", "quickbooks", "sage", "netsuite", "sap", "accounting integration", "sync revenue", "financial sync"],
    answer:
      "XYVOO connects to Xero, QuickBooks, Sage, NetSuite, and SAP. Revenue postings, payments, refunds, and supplier invoices sync in real time. For accounting systems not on this list, a structured CSV export is available for manual import.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Does XYVOO handle VAT and tax invoices?",
    keywords: ["vat", "tax invoice", "receipt", "tax", "firs", "compliance", "invoice", "tax registration", "tax number", "firs compliance"],
    answer:
      "Yes. XYVOO supports multiple tax types - VAT, city tax, tourism levy, service charge - each with configurable rates. Tax invoices include your hotel's tax registration number, itemised tax lines, and are formatted for regulatory compliance. All receipts and invoices are available digitally and in print.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can I do check-in without the guest coming to the front desk?",
    keywords: ["express check in", "self check in", "contactless", "pre arrival", "kiosk", "digital check in", "no queue", "remote check in"],
    answer:
      "Yes. Guests can complete a pre-arrival digital check-in form, have their ID captured, and receive a digital key - all before they arrive. A self-service kiosk mode is also available for fully unattended check-in and check-out.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "How does night audit work in XYVOO?",
    keywords: ["night audit", "end of day", "close of business", "daily close", "audit", "reconciliation", "end of day process"],
    answer:
      "XYVOO runs an automated night audit that closes the current business day and rolls the system to the next date. It flags posting exceptions and requires GM approval before the close is confirmed. A night audit summary report is generated automatically with daily revenue totals, exceptions, and final occupancy figures.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "What payment methods can hotels accept?",
    keywords: ["payment", "card", "cash", "payment provider", "stripe", "paystack", "flutterwave", "adyen", "accept payment", "pos payment"],
    answer:
      "Hotels can accept card payments via Stripe, Adyen, Flutterwave, or Paystack, plus cash, direct billing to corporate accounts, and OTA virtual credit cards. Split billing is supported - by guest name, room, item category, or custom percentage. Multi-currency settlement is also available.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "How does housekeeping work in XYVOO?",
    keywords: ["housekeeping", "room cleaning", "run sheet", "room status", "attendant", "dirty room", "clean room", "housekeeping module"],
    answer:
      "The housekeeping module auto-generates daily run sheets each morning sorted by check-out priority, floor, and section. Room attendants work from their phones - they accept tasks, update room status, and flag faults in real time. Supervisors see a live room status board and sign off inspections digitally.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can my restaurant and bar use XYVOO for orders?",
    keywords: ["restaurant", "bar", "pos", "food orders", "f&b", "table management", "kitchen", "restaurant system", "bar system"],
    answer:
      "Yes. XYVOO includes a full F&B point-of-sale system for restaurants, bars, and room service. Orders flow directly to kitchen display screens. Charges post automatically to guest room folios. Menus are managed centrally and can be scheduled by time of day - breakfast, lunch, dinner, and bar menus activate automatically.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can I track maintenance and repairs in XYVOO?",
    keywords: ["maintenance", "repairs", "fault", "work order", "engineering", "broken", "fix", "asset", "maintenance tracking"],
    answer:
      "Yes. Any staff member can log a maintenance fault from any department. The system creates a work order, routes it to the correct technician, and tracks it from reported to resolved. Guest-impacting faults automatically block the room from new arrivals. Preventive maintenance schedules and an asset register are also included.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Does XYVOO have a kitchen display system?",
    keywords: ["kds", "kitchen display", "kitchen screen", "kitchen orders", "paperless kitchen", "kitchen system", "order display"],
    answer:
      "Yes. Orders placed from any POS terminal appear instantly on kitchen display screens organised by station - grill, cold, pastry, bar. Kitchen staff mark items as preparing, ready, or complete. The system is fully paperless. Kitchen staff can also flag items as unavailable directly from the KDS.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can I manage staff schedules and timesheets in XYVOO?",
    keywords: ["staff schedule", "roster", "timesheet", "shift", "clock in", "clock out", "attendance", "hr", "staff management"],
    answer:
      "Yes. XYVOO includes a scheduling module with a drag-and-drop shift roster builder, mobile clock-in and clock-out with GPS verification, overtime tracking, leave request and approval workflows, and payroll export to Xero, QuickBooks, Sage, or CSV.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "What reports does XYVOO generate?",
    keywords: ["reports", "analytics", "revenue report", "occupancy report", "reporting", "data", "dashboard", "performance", "insights"],
    answer:
      "XYVOO generates a full suite of reports including: live operations dashboard, revenue dashboard with ADR and RevPAR, arrivals and departures lists, channel production reports, housekeeping performance, maintenance reports, night audit summaries, F&B outlet reports, and HR attendance reports. Reports can be scheduled for automatic email delivery daily, weekly, or monthly.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can I manage procurement and stock in XYVOO?",
    keywords: ["procurement", "stock", "inventory", "purchase order", "vendor", "supplier", "goods receiving", "store", "stock management"],
    answer:
      "Yes. XYVOO includes both a procurement module and an inventory module. Procurement handles vendor management, purchase orders, approval workflows, and goods receiving. Inventory tracks stock levels per department, consumption, reorder alerts, and stocktake. F&B stock levels update automatically when items are sold through the POS.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "What is the direct booking engine?",
    keywords: ["direct booking", "booking engine", "hotel website booking", "own website", "book direct", "widget", "no commission"],
    answer:
      "XYVOO includes a direct booking engine - an embeddable widget you can add to your hotel's own website. Guests can check availability, select a room, and pay - all without going through an OTA. Direct bookings carry no commission, making them significantly more profitable than OTA bookings.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Can XYVOO handle group bookings and corporate accounts?",
    keywords: ["group booking", "corporate", "block booking", "rooming list", "corporate rate", "direct billing", "company account"],
    answer:
      "Yes. XYVOO supports group block management - block rooms, upload rooming lists, track attrition, and set cut-off date alerts. Corporate accounts can be set up with negotiated rates and direct billing - approved companies are invoiced monthly rather than paying per stay.",
  },
  {
    category: "Hotel Management System (HMS)",
    question: "Does XYVOO support loyalty points for guests?",
    keywords: ["loyalty", "points", "rewards", "guest loyalty", "loyalty programme", "repeat guest", "loyalty system"],
    answer:
      "Yes. XYVOO includes a loyalty points system. Guests accumulate points across stays and can redeem them during checkout. The loyalty programme is managed from the admin settings and is fully branded under your hotel's identity.",
  },

  // Category 3 — XYVOO Store
  {
    category: "XYVOO Store",
    question: "What is the XYVOO Store?",
    keywords: ["store", "online store", "ecommerce", "sell online", "what is the store", "merchant", "shop", "online shop"],
    answer:
      "The XYVOO Store is a multi-tenant e-commerce platform. Merchants sign up and get a fully branded online storefront on their own subdomain - your store, your name, your products. The dashboard covers everything: product management, inventory, orders, customers, payments, shipping, analytics, and marketing tools.",
  },
  {
    category: "XYVOO Store",
    question: "How much does the XYVOO Store cost?",
    keywords: ["store pricing", "store cost", "free plan", "standard plan", "enterprise", "store subscription", "how much", "store price"],
    answer:
      "The Store has three plans. The Free plan costs nothing but charges a 4% platform fee per order. The Standard plan costs N10,000 per month with zero platform fees. The Enterprise plan has custom pricing with custom transaction fees and dedicated support for larger businesses.",
  },
  {
    category: "XYVOO Store",
    question: "Do I need to build a website to use the XYVOO Store?",
    keywords: ["no website", "build website", "storefront", "website builder", "launch store", "no coding", "ready made store"],
    answer:
      "No. When you sign up, XYVOO gives you a ready-to-use storefront on your own subdomain. You add your products, set your prices, and start selling. No coding, no design work, and no hosting setup is required.",
  },
  {
    category: "XYVOO Store",
    question: "What payment methods does the XYVOO Store support?",
    keywords: ["store payment", "paystack", "checkout", "accept payment", "payment gateway", "store payment integration", "online payment"],
    answer:
      "The XYVOO Store integrates with Paystack as the primary payment gateway, enabling Nigerian merchants to accept card payments at checkout. Additional payment gateways are on the roadmap.",
  },
  {
    category: "XYVOO Store",
    question: "Can I manage my staff on the XYVOO Store?",
    keywords: ["staff", "team", "staff access", "store staff", "permissions", "roles", "multiple users", "team members"],
    answer:
      "Yes. The Store dashboard includes staff management. You can add team members, assign roles, and control what each person can access within your store's dashboard.",
  },
  {
    category: "XYVOO Store",
    question: "Can my store be installed as an app on customers' phones?",
    keywords: ["pwa store", "install store", "mobile store", "app store", "customer app", "progressive web app", "phone app"],
    answer:
      "Yes. The XYVOO Store is a PWA. Customers can add your store to their home screen from their browser. It behaves like a native app with your store's name and branding. No app store submission is required.",
  },
  {
    category: "XYVOO Store",
    question: "Can I import products in bulk?",
    keywords: ["import products", "bulk upload", "csv import", "product import", "mass upload", "bulk products"],
    answer:
      "Yes. The Store dashboard includes a product import tool. You can upload products in bulk via a structured file, saving significant time when migrating from another platform or adding a large catalogue at once.",
  },
  {
    category: "XYVOO Store",
    question: "Does the XYVOO Store support product variants?",
    keywords: ["variants", "sizes", "colours", "product options", "variations", "sku", "product variants"],
    answer:
      "Yes. Products in the XYVOO Store support variants - different sizes, colours, or configurations of the same item - each with their own price, stock level, and SKU.",
  },
  {
    category: "XYVOO Store",
    question: "Can I run discounts and promotions on my store?",
    keywords: ["discount", "promo code", "promotion", "sale", "coupon", "offer", "percentage off", "discount code"],
    answer:
      "Yes. The Store includes a discounts module where you can create percentage or fixed-amount discount codes, set validity periods, and apply them to specific products or your entire catalogue.",
  },
  {
    category: "XYVOO Store",
    question: "Does the XYVOO Store have SEO tools?",
    keywords: ["seo", "search engine", "google", "meta tags", "seo manager", "search ranking", "visibility", "organic traffic"],
    answer:
      "Yes. The Store dashboard includes an SEO manager where you can configure meta titles, descriptions, and other SEO settings for your store and individual product pages to improve visibility on search engines.",
  },
  {
    category: "XYVOO Store",
    question: "Can I send marketing emails to my customers?",
    keywords: ["email marketing", "newsletter", "customer email", "marketing", "campaigns", "email campaign", "mailing list"],
    answer:
      "Yes. The Store includes an email marketing tool. You can build customer mailing lists, create campaigns, and send targeted emails - all from within your store dashboard without needing a separate email marketing tool.",
  },
  {
    category: "XYVOO Store",
    question: "Does the XYVOO Store track my inventory automatically?",
    keywords: ["inventory tracking", "stock tracking", "out of stock", "stock level", "inventory management", "auto stock"],
    answer:
      "Yes. The Store tracks inventory levels automatically. When a product sells, its stock count updates immediately. You can set stock levels per product and variant, and the system will show items as out of stock when inventory runs out.",
  },
  {
    category: "XYVOO Store",
    question: "Can I manage shipping on the XYVOO Store?",
    keywords: ["shipping", "delivery", "shipping rates", "logistics", "delivery options", "shipping management"],
    answer:
      "Yes. The Store dashboard includes shipping management where you can configure delivery options, set shipping rates by zone or weight, and manage fulfilment from a single place.",
  },
  {
    category: "XYVOO Store",
    question: "Can customers create accounts on my store?",
    keywords: ["customer account", "guest checkout", "login store", "customer profile", "returning customer", "customer login"],
    answer:
      "Yes. Customers can create accounts on your store, which allows them to track orders, save their details for faster checkout, and build a purchase history. Guest checkout is also available for customers who prefer not to register.",
  },
  {
    category: "XYVOO Store",
    question: "What analytics does the XYVOO Store provide?",
    keywords: ["store analytics", "sales data", "revenue tracking", "store reports", "performance", "insights", "store dashboard"],
    answer:
      "The Store provides a revenue and analytics dashboard covering sales performance, order volumes, top-selling products, customer data, and traffic insights. All data is scoped to your store and presented in your dashboard - not shared with other merchants.",
  },

  // Category 4 — Pricing & Billing
  {
    category: "Pricing & Billing",
    question: "How much does the XYVOO HMS cost?",
    keywords: ["hms price", "hotel system cost", "how much", "pricing", "subscription", "cost", "monthly", "yearly", "hms subscription"],
    answer:
      "The HMS has one plan - all features included. Three billing cycles are available: Monthly at N200,000 per month, Quarterly at N550,000 per quarter saving 8%, and Yearly at N2,000,000 per year saving 17%. All cycles include every feature, every integration, and unlimited staff accounts.",
  },
  {
    category: "Pricing & Billing",
    question: "Is there a free trial?",
    keywords: ["free trial", "trial", "try before paying", "no credit card", "14 days", "test", "demo", "try xyvoo"],
    answer:
      "Yes. Every HMS plan comes with a 14-day free trial with no credit card required. You get full access to the entire system from day one. If you choose not to continue, your account is suspended - not deleted - at the end of day 14.",
  },
  {
    category: "Pricing & Billing",
    question: "Can I switch between monthly, quarterly, and yearly billing?",
    keywords: ["change plan", "switch billing", "upgrade", "downgrade", "change cycle", "billing cycle", "switch plan"],
    answer:
      "Yes. You can switch your billing cycle at any time from your account settings. If you switch mid-cycle, the remaining balance is prorated automatically.",
  },
  {
    category: "Pricing & Billing",
    question: "What happens if my payment fails?",
    keywords: ["payment failed", "card declined", "failed payment", "billing issue", "suspended", "payment error", "missed payment"],
    answer:
      "If a payment fails, your account remains active while XYVOO attempts to resolve it. You will receive an email notification with instructions. If the payment is not resolved within the grace period, your account is suspended - your data is preserved and access is restored as soon as a valid payment is made.",
  },
  {
    category: "Pricing & Billing",
    question: "Will I lose my data if I cancel?",
    keywords: ["cancel", "data", "delete account", "cancellation", "lose data", "what happens when I cancel", "data after cancel"],
    answer:
      "No. If you cancel or your account is suspended, your data is preserved. You can reactivate at any time and pick up exactly where you left off. Data is only permanently deleted upon a formal written deletion request.",
  },
  {
    category: "Pricing & Billing",
    question: "Are there any hidden fees?",
    keywords: ["hidden fees", "extra charges", "additional cost", "transaction fee", "setup fee", "onboarding fee", "extra cost"],
    answer:
      "No hidden fees for the HMS. The price you see is the price you pay. There are no setup fees, onboarding fees, or per-transaction charges on the HMS. For the Store, the Free plan charges a 4% platform fee per order - the Standard plan has zero platform fees.",
  },
  {
    category: "Pricing & Billing",
    question: "Do all billing cycles include the same features?",
    keywords: ["same features", "plan features", "monthly vs yearly", "feature difference", "what's included", "all features"],
    answer:
      "Yes. Every billing cycle - monthly, quarterly, and yearly - includes every feature. The only difference is the billing frequency and the total cost. Longer commitments receive a discount: 8% on quarterly and 17% on yearly.",
  },
  {
    category: "Pricing & Billing",
    question: "Can I get a refund if I change my mind?",
    keywords: ["refund", "money back", "cancel refund", "refund policy", "change my mind", "refund request"],
    answer:
      "Refund requests are handled case by case. Please contact XYVOO support with your request. Refunds are generally considered for the unused portion of a prepaid billing period where cancellation occurs early in the cycle.",
  },
  {
    category: "Pricing & Billing",
    question: "Is there a setup or onboarding fee?",
    keywords: ["setup fee", "onboarding fee", "implementation fee", "one time fee", "upfront cost", "initial payment"],
    answer:
      "No. There are no setup or onboarding fees. You pay only your chosen subscription. The onboarding process is self-serve and guided - and if you need hands-on help, the XYVOO support team provides it at no extra charge.",
  },
  {
    category: "Pricing & Billing",
    question: "Can I pay annually and get invoiced for my records?",
    keywords: ["annual invoice", "invoice", "receipt", "billing receipt", "payment receipt", "tax invoice", "accounting record"],
    answer:
      "Yes. A detailed invoice is generated for every payment - monthly, quarterly, or yearly. Invoices are available in your account billing history at any time and can be downloaded for your accounting records.",
  },
  {
    category: "Pricing & Billing",
    question: "What currencies does XYVOO accept for billing?",
    keywords: ["billing currency", "naira", "usd", "payment currency", "foreign currency", "pay in dollars", "gbp"],
    answer:
      "XYVOO currently bills in Nigerian Naira (N). International billing options are on the roadmap. Your hotel's own guest billing can be configured in any currency with live exchange rates applied.",
  },

  // Category 5 — Onboarding & Setup
  {
    category: "Onboarding & Setup",
    question: "How long does it take to get started?",
    keywords: ["setup time", "how long", "get started", "onboarding", "time to launch", "quick setup", "fast", "how fast"],
    answer:
      "Signup takes under 2 minutes. Once you complete the four-step signup flow, your branded system is provisioned and live within 60 seconds. Your staff can install the PWA and begin using the system the same day.",
  },
  {
    category: "Onboarding & Setup",
    question: "Do I need technical knowledge to set up XYVOO?",
    keywords: ["technical", "no coding", "easy setup", "non technical", "it knowledge", "developer", "setup", "technical skills"],
    answer:
      "No. XYVOO is designed for hotel operators and business owners - not developers. The setup wizard walks you through every configuration step. If you get stuck, XYVOO support can access your system directly and complete the setup on your behalf.",
  },
  {
    category: "Onboarding & Setup",
    question: "What do I need to set up before I can start taking bookings?",
    keywords: ["minimum setup", "go live", "start taking bookings", "first steps", "required setup", "checklist", "ready to use"],
    answer:
      "The minimum required to start taking bookings is: hotel identity and branding, room types and inventory, financial and tax configuration, and a connected payment provider. OTA connections, accounting integrations, and smart lock setup can all be completed after you go live.",
  },
  {
    category: "Onboarding & Setup",
    question: "Can XYVOO support set up the system for me?",
    keywords: ["support setup", "help with setup", "onboarding help", "setup assistance", "do it for me", "support", "hands on help"],
    answer:
      "Yes. XYVOO operates as part of your team. When you raise a support request, the team can access your system directly and configure it on your behalf. You do not need to troubleshoot or figure things out yourself. This is covered in your service agreement.",
  },
  {
    category: "Onboarding & Setup",
    question: "How do my staff get access to the system?",
    keywords: ["staff access", "invite staff", "add staff", "staff login", "how do staff log in", "onboard staff", "staff invite"],
    answer:
      "During setup, you add staff accounts from your admin dashboard - name, email, and role. Each staff member receives an invite email from your hotel's identity. They click the link, set their password, and install the PWA. From that point they log in using their own credentials.",
  },
  {
    category: "Onboarding & Setup",
    question: "Can I add my room types and floor plan during setup?",
    keywords: ["room types", "floor plan", "room setup", "configure rooms", "add rooms", "room configuration", "room inventory"],
    answer:
      "Yes. During setup you define your own room types - Standard, Deluxe, Suite, or whatever names your hotel uses. For each type you set the quantity, base rate, and maximum occupancy. A room skeleton is pre-built from the room count you provide at signup, ready for you to review and refine.",
  },
  {
    category: "Onboarding & Setup",
    question: "How do I connect my hotel to Booking.com and other OTAs?",
    keywords: ["connect booking.com", "ota setup", "channel manager setup", "connect expedia", "ota integration", "connect airbnb"],
    answer:
      "OTA connections are set up from your admin settings after signup. Each OTA connects independently via API credentials you generate from your OTA extranet. XYVOO's channel manager then handles all two-way sync automatically. Step-by-step guides are available in the help centre for each OTA.",
  },
  {
    category: "Onboarding & Setup",
    question: "Can I migrate from my existing hotel system to XYVOO?",
    keywords: ["migrate", "switch", "existing system", "moving from", "import data", "transition", "old system", "migration"],
    answer:
      "Yes. The XYVOO support team assists with migrations from existing hotel systems. Guest history, reservations, and room configuration can be imported. Contact support before signing up to discuss the specific system you are migrating from and what data can be carried over.",
  },
  {
    category: "Onboarding & Setup",
    question: "What happens to my system URL if I change my hotel name?",
    keywords: ["change hotel name", "rename", "subdomain change", "url change", "hotel name update", "rebrand"],
    answer:
      "Your subdomain is assigned at signup and can be changed once within the first 30 days. After that, subdomain changes require a support request. Your hotel's display name - what staff and guests see in the interface - can be updated at any time from your admin settings.",
  },
  {
    category: "Onboarding & Setup",
    question: "Can I add more properties to my account later?",
    keywords: ["add property", "new property", "second hotel", "expand", "multi property", "additional hotel", "grow"],
    answer:
      "Yes. After your first property is live, you can add additional properties from your admin dashboard using the Add Property option. Each new property goes through its own configuration setup and shares your account and billing relationship.",
  },

  // Category 6 — Security & Data Privacy
  {
    category: "Security & Data Privacy",
    question: "Is my hotel's data kept separate from other hotels on XYVOO?",
    keywords: ["data isolation", "data separation", "tenant isolation", "secure data", "other hotels", "shared database", "privacy"],
    answer:
      "Yes. Every tenant's data is strictly isolated. Although the platform uses shared infrastructure, every record in the database is scoped to your tenant ID and protected by Row Level Security. No hotel can access another hotel's data - ever. Isolation is enforced at the database layer, not just the application layer.",
  },
  {
    category: "Security & Data Privacy",
    question: "Is XYVOO PCI-DSS compliant?",
    keywords: ["pci dss", "card security", "payment security", "pci compliant", "card data", "credit card security"],
    answer:
      "Yes. XYVOO is PCI-DSS Level 1 compliant. No raw card numbers are ever stored on XYVOO servers. All card data is tokenised through Stripe or Adyen's certified vault from the moment of entry. XYVOO undergoes annual security assessments to maintain this certification.",
  },
  {
    category: "Security & Data Privacy",
    question: "Does XYVOO comply with GDPR and data protection laws?",
    keywords: ["gdpr", "data protection", "ndpa", "privacy law", "nigeria data protection", "pdpa", "ccpa", "compliance", "data regulations"],
    answer:
      "Yes. XYVOO is built for compliance with GDPR, Nigeria Data Protection Act (NDPA), PDPA, and CCPA. Guest personal data is handled in accordance with applicable data protection regulations. Data residency can be configured per tenant for enterprise requirements.",
  },
  {
    category: "Security & Data Privacy",
    question: "Who can access my hotel's data?",
    keywords: ["who can access", "data access", "xyvoo access", "support access", "admin access", "data visibility"],
    answer:
      "Your hotel's data is accessible only to your authorised staff accounts. XYVOO support staff may access your system to provide direct support - this is disclosed in your service agreement and every access session is logged with a full timestamp and audit trail. You can request a complete access log at any time.",
  },
  {
    category: "Security & Data Privacy",
    question: "How long is data retained?",
    keywords: ["data retention", "how long data kept", "data storage", "retention policy", "delete data", "data history"],
    answer:
      "Operational data is retained for the lifetime of your account. Financial records and audit logs are retained for a minimum of 7 years in an immutable format to satisfy financial compliance requirements. If you close your account, your data is retained for a grace period before permanent deletion upon formal written request.",
  },
  {
    category: "Security & Data Privacy",
    question: "Is there an audit log of everything that happens in my system?",
    keywords: ["audit log", "activity log", "who did what", "track changes", "audit trail", "history", "log"],
    answer:
      "Yes. Every action in the system is logged - who did it, what they changed, which record was affected, and at what time. The audit log is immutable and retained for 7 years. Financial actions, guest data changes, reservation modifications, and staff activity are all captured.",
  },
  {
    category: "Security & Data Privacy",
    question: "What happens to my data if I stop using XYVOO?",
    keywords: ["close account", "stop using", "cancel account", "data after cancellation", "export data", "data portability"],
    answer:
      "If you stop using XYVOO, your data is preserved in a suspended state. You can reactivate at any time. If you formally request account deletion, your data is permanently deleted within 30 days. Before deletion, you can request an export of your data in a standard format.",
  },
  {
    category: "Security & Data Privacy",
    question: "Can I export my data from XYVOO?",
    keywords: ["export data", "download data", "data export", "portability", "my data", "extract data", "backup"],
    answer:
      "Yes. All reports in XYVOO can be exported to PDF or CSV. Financial records, guest data, reservation history, and operational reports can all be exported from their respective sections. For a full account data export, contact XYVOO support.",
  },
  {
    category: "Security & Data Privacy",
    question: "How is my payment information stored?",
    keywords: ["payment data", "card storage", "card details", "payment info", "how card stored", "security payment"],
    answer:
      "XYVOO never stores raw card numbers. When a card is entered, it is immediately tokenised by the payment provider - Stripe, Adyen, Flutterwave, or Paystack. Only a token and the last four digits are stored, which cannot be used to initiate an unauthorised transaction.",
  },
  {
    category: "Security & Data Privacy",
    question: "Does XYVOO use my hotel's data for any other purpose?",
    keywords: ["data use", "data sharing", "sell data", "use my data", "data policy", "third party", "data shared"],
    answer:
      "No. Your hotel's operational data - guest records, reservations, financial data - is used solely to power your system. XYVOO does not sell, share, or use tenant data for advertising, profiling, or any purpose beyond operating your account. Platform-level analytics used internally by XYVOO are always anonymised and aggregated.",
  },

  // Category 7 — Support & Account Management
  {
    category: "Support & Account Management",
    question: "How does XYVOO support work?",
    keywords: ["support", "help", "customer support", "how to get help", "contact support", "support model", "xyvoo support"],
    answer:
      "XYVOO operates as part of your team. When you raise a support request, the team does not ask you to troubleshoot. A support agent accesses your system directly, identifies the issue, fixes it, and closes the ticket with a summary of what was done. You can reach support via email, the in-app support widget, or WhatsApp.",
  },
  {
    category: "Support & Account Management",
    question: "Can XYVOO go into my system without me knowing?",
    keywords: ["access without permission", "xyvoo access", "impersonation", "support access", "unsolicited access", "privacy"],
    answer:
      "XYVOO can access your system to provide support - this capability is explicitly disclosed in your service agreement, which you review and accept at signup. Every access session is logged with a timestamp, the name of the XYVOO agent, and a record of every action taken. You can request this log at any time. No access is ever taken for any purpose other than delivering support.",
  },
  {
    category: "Support & Account Management",
    question: "What hours is XYVOO support available?",
    keywords: ["support hours", "24/7 support", "availability", "when is support available", "response time", "support response"],
    answer:
      "XYVOO provides priority 24/7 support for Quarterly and Yearly subscribers. Monthly subscribers receive standard support during business hours. All support requests are acknowledged within 2 hours regardless of plan.",
  },
  {
    category: "Support & Account Management",
    question: "How do I raise a support ticket?",
    keywords: ["raise ticket", "submit ticket", "contact support", "support request", "get help", "report issue", "support ticket"],
    answer:
      "You can raise a support ticket via three channels: the in-app support widget from your dashboard, email to the XYVOO support address, or WhatsApp. All three channels create a ticket in the support system and are monitored by the support team.",
  },
  {
    category: "Support & Account Management",
    question: "Can I change my admin email address?",
    keywords: ["change email", "update email", "admin email", "email change", "new email", "account email"],
    answer:
      "Yes. Your admin email address can be updated from your account settings. A verification email is sent to the new address before the change is confirmed to prevent unauthorised changes.",
  },
  {
    category: "Support & Account Management",
    question: "How do I reset my password?",
    keywords: ["reset password", "forgot password", "password reset", "lost password", "change password", "password help"],
    answer:
      "From the login screen, click Forgot Password. A reset link is sent to your registered admin email address. The link is valid for 30 minutes. If you do not receive the email, check your spam folder or contact support.",
  },
  {
    category: "Support & Account Management",
    question: "Can I have multiple admin accounts?",
    keywords: ["multiple admins", "two admins", "admin accounts", "shared admin", "co admin", "admin access"],
    answer:
      "In V1, each tenant has one master admin account created at signup. Additional staff accounts can be created with GM-level access which provides near-full system access. True multi-admin with separate billing authority is on the V2 roadmap.",
  },
  {
    category: "Support & Account Management",
    question: "How do I deactivate a staff member who has left?",
    keywords: ["deactivate staff", "remove staff", "staff left", "revoke access", "delete staff", "ex employee", "staff access revoked"],
    answer:
      "From your admin dashboard, go to Staff Accounts, find the staff member, and click Deactivate. Their access is revoked immediately. Their activity history and records are preserved in the system's audit log. Deactivated accounts do not count against any staff limit.",
  },
  {
    category: "Support & Account Management",
    question: "What do I do if I suspect unauthorised access to my system?",
    keywords: ["unauthorised access", "security breach", "suspicious activity", "hacked", "account compromised", "security issue"],
    answer:
      "Contact XYVOO support immediately via WhatsApp or email marked URGENT. The support team will review your audit log, identify the access event, lock the affected accounts, and work with you to secure your system. Change your admin password immediately as a first step.",
  },
  {
    category: "Support & Account Management",
    question: "Can I white-label the system further - for example, use my own domain instead of a subdomain?",
    keywords: ["custom domain", "own domain", "white label domain", "remove xyvoo from url", "branded domain", "domain setup"],
    answer:
      "Custom domain support - where your system runs on app.yourhotel.com instead of yourhotel.xyvoo.com - is a V2 feature currently in development. The platform architecture is already designed to support it without any data migration. V1 uses subdomain-based URLs only.",
  },
  {
    category: "Support & Account Management",
    question: "How do I update my billing information?",
    keywords: ["update billing", "change card", "new card", "billing update", "payment method", "update payment"],
    answer:
      "Your billing information can be updated at any time from your account settings under Billing & Subscription. Changes take effect on your next billing cycle. Updating your card details does not affect your current subscription or any active trial.",
  },
];

