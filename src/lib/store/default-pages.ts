/*
 * A shop's website pages, written for it from what it told us in setup: its
 * name, what it sells, where it is, how it delivers and how customers pay,
 * with pictures from its own products. Every shop gets a proper brand site
 * (About, Contact, FAQs, Delivery and returns, Privacy, Terms), not just a
 * shop. The words never invent facts (no founding years, no customer counts);
 * the merchant can make each page their own in Website > Pages.
 * No server code here, so it's easy to test.
 */
import { formatShopCurrency } from "@/lib/shop/format";
import type { StoreCategory } from "./site/templates";
import type { PageBlock, PageImage, SystemPageKey } from "./pages";

export type DefaultPagesContext = {
  storeName: string;
  category: StoreCategory | null;
  /** What they sell, in their words, when the category is "other". */
  categoryOther?: string | null;
  city?: string | null;
  state?: string | null;
  currency: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  deliveryOptions: Array<{ name: string; fee: number; freeOver: number | null; etaText: string | null; isPickup: boolean }>;
  paymentMethods: Array<"card" | "bank_transfer" | "pay_on_delivery" | "whatsapp">;
  /** Pictures from the shop's products, best first. */
  images: PageImage[];
};

export type DefaultPage = {
  systemKey: SystemPageKey;
  title: string;
  slug: string;
  showInMenu: boolean;
  seoTitle: string;
  seoDescription: string;
  body: PageBlock[];
};

type CategoryWords = {
  /** "beautiful clothes and accessories" — what the shop sells, in a phrase. */
  things: string;
  aboutLead: string;
  story: string;
  promises: Array<{ title: string; text: string }>;
  faqs: Array<{ question: string; answer: string }>;
};

const CATEGORY_WORDS: Record<Exclude<StoreCategory, "other">, CategoryWords> = {
  fashion: {
    things: "clothing and accessories",
    aboutLead: "Pieces chosen to make you feel your best, from everyday staples to something special for the big occasion.",
    story:
      "We started {name} because we wanted getting dressed to feel exciting again. Every piece we sell is one we would happily wear ourselves: well made, flattering and easy to style.\n\nWe keep our collections small and considered, so you can shop with confidence and build a wardrobe you love.",
    promises: [
      { title: "Chosen with care", text: "We pick every piece for its quality, fit and finish, so you can buy with confidence." },
      { title: "Help with sizing", text: "Not sure what will fit? Message us before you order and we'll help you choose." },
      { title: "Delivered with care", text: "Your order is checked, packed carefully and sent on its way as quickly as we can." },
    ],
    faqs: [
      { question: "How do I choose my size?", answer: "Each product shows the sizes available. If you're between sizes or unsure, contact us before you order and we'll help." },
      { question: "Will the colour look the same as the photos?", answer: "We photograph our products in natural light so they look as true to life as possible, but screens vary a little." },
    ],
  },
  beauty: {
    things: "hair, beauty and skincare",
    aboutLead: "Beauty that makes you feel like yourself, only more so: products we trust, chosen for how well they work.",
    story:
      "{name} began with a simple idea: everyone deserves products that make them look and feel good, without the guesswork. We try what we sell and only stock what we'd recommend to a friend.\n\nWhether you know exactly what you want or need a little advice, we're here to help you find it.",
    promises: [
      { title: "Products we believe in", text: "We only sell what we'd happily use ourselves, from brands and suppliers we trust." },
      { title: "Advice when you need it", text: "Not sure what suits your hair or skin? Send us a message and we'll help you choose." },
      { title: "Packed with care", text: "Every order is checked and packed carefully so it reaches you in perfect condition." },
    ],
    faqs: [
      { question: "Which product is right for me?", answer: "Get in touch with a little about your hair or skin and what you'd like to achieve, and we'll suggest what might suit you." },
      { question: "Are your products genuine?", answer: "Yes. We buy from the brands themselves or from suppliers we trust." },
    ],
  },
  home: {
    things: "homeware and furniture",
    aboutLead: "Pieces that make a house feel like home: practical, beautiful and made to last.",
    story:
      "We started {name} to make it easier to find things for the home that are both lovely to look at and good to live with. Everything we sell is chosen for quality, comfort and how well it will last.\n\nTake your time, look around, and get in touch if you'd like help choosing.",
    promises: [
      { title: "Made to last", text: "We choose pieces for their materials and finish, so they look good for years, not months." },
      { title: "Help choosing", text: "Measurements, materials or colours: ask us anything before you order." },
      { title: "Careful delivery", text: "Larger items are packed securely and delivered with care." },
    ],
    faqs: [
      { question: "Can I see more photos or measurements?", answer: "Yes. Contact us with the product you're interested in and we'll send whatever you need." },
      { question: "Do you deliver large items?", answer: "Yes. Delivery options and costs are shown at checkout once you enter your address." },
    ],
  },
  food: {
    things: "food and drink",
    aboutLead: "Good food, made and chosen with care, delivered fresh to your door.",
    story:
      "{name} started in the kitchen, with a love of good food and the people we share it with. We care about where our ingredients come from and how everything is made.\n\nOrder for yourself, for the family or for a celebration: we'll make sure it arrives just right.",
    promises: [
      { title: "Quality ingredients", text: "We choose our ingredients carefully and never cut corners on taste." },
      { title: "Made fresh", text: "We prepare orders as close to delivery as we can, so they reach you at their best." },
      { title: "Happy to help", text: "Ordering for an event or have a dietary need? Message us and we'll do our best to help." },
    ],
    faqs: [
      { question: "Do you cater for allergies and dietary needs?", answer: "Please contact us before you order and tell us what you need. We'll let you know what we can safely offer." },
      { question: "How should I store my order?", answer: "Storage advice is on each product. If you're not sure, ask us and we'll help." },
    ],
  },
  electronics: {
    things: "electronics and gadgets",
    aboutLead: "The gadgets and accessories you need, from people who know what they're selling.",
    story:
      "{name} was set up to make buying electronics simple and trustworthy. We stock products we know well, explain them plainly and stand behind what we sell.\n\nIf you're not sure which option is right for you, ask us. We'd rather help you choose well than sell you the wrong thing.",
    promises: [
      { title: "Genuine products", text: "We buy from trusted suppliers and check what we sell." },
      { title: "Straight answers", text: "Questions about compatibility or features? We'll give you a clear, honest answer." },
      { title: "Here after you buy", text: "If something isn't right, contact us and we'll sort it out." },
    ],
    faqs: [
      { question: "Is this compatible with my device?", answer: "Send us the make and model of your device and we'll check before you order." },
      { question: "Do your products come with a warranty?", answer: "Warranty details are on each product where they apply. Ask us if you'd like to know more." },
    ],
  },
  health: {
    things: "health and wellness products",
    aboutLead: "Products to help you feel your best, chosen with care and sold with honest advice.",
    story:
      "We started {name} because looking after yourself shouldn't be complicated. We choose products we trust and explain them simply, so you can make good choices for you and your family.\n\nIf you have a question, get in touch. We're always happy to help.",
    promises: [
      { title: "Trusted products", text: "We stock products from suppliers we trust and check what we sell." },
      { title: "Honest advice", text: "We explain what each product is for in plain words. For medical advice, always speak to a professional." },
      { title: "Discreet delivery", text: "Every order is packed carefully and discreetly." },
    ],
    faqs: [{ question: "Can you advise me on what to take?", answer: "We can tell you about our products, but we can't give medical advice. Please speak to a doctor or pharmacist about your health." }],
  },
  kids: {
    things: "baby and children's products",
    aboutLead: "Everything for little ones, chosen by people who understand what parents need.",
    story:
      "{name} began with a simple aim: to make shopping for babies and children easier and more joyful. We choose products that are safe, practical and lovely, the kind we'd buy for our own families.\n\nIf you need help choosing a gift or the right size, we're only a message away.",
    promises: [
      { title: "Chosen with care", text: "We pick products for safety, quality and how well they'll stand up to everyday family life." },
      { title: "Help with sizes and ages", text: "Not sure what to choose? Tell us the age and we'll help." },
      { title: "Lovely to give", text: "Buying a gift? Let us know and we'll do our best to make it special." },
    ],
    faqs: [{ question: "What size should I choose?", answer: "Sizes are shown on each product. Tell us your child's age and we'll help you choose." }],
  },
};

function wordsFor(ctx: DefaultPagesContext): CategoryWords {
  if (ctx.category && ctx.category !== "other") return CATEGORY_WORDS[ctx.category];
  const things = ctx.categoryOther?.trim().toLowerCase() || "products we love";
  return {
    things,
    aboutLead: `Welcome to ${ctx.storeName}. We're here to bring you ${things} you'll be glad you found.`,
    story:
      "We started {name} to share things we genuinely care about. Everything we sell is chosen with care, and we're always happy to help you find what you're looking for.\n\nHave a look around, and get in touch if you have any questions.",
    promises: [
      { title: "Chosen with care", text: "Everything we sell is picked for its quality." },
      { title: "Here to help", text: "Questions before you buy? Message us and we'll get back to you." },
      { title: "Packed with care", text: "Every order is checked and packed carefully." },
    ],
    faqs: [],
  };
}

const PAYMENT_WORDS: Record<DefaultPagesContext["paymentMethods"][number], string> = {
  card: "by card, bank transfer or USSD on Paystack's secure checkout",
  bank_transfer: "by bank transfer (we show our account details after you order)",
  pay_on_delivery: "when your order arrives",
  whatsapp: "by arranging payment with us on WhatsApp",
};

function list(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

function howToPay(ctx: DefaultPagesContext) {
  return ctx.paymentMethods.length
    ? `You can pay ${list(ctx.paymentMethods.map((m) => PAYMENT_WORDS[m]))}.`
    : "The ways you can pay are shown at checkout.";
}

/** One sentence per delivery option, e.g. "Lagos delivery: ₦2,500, usually 1 to 2 days. Free on orders over ₦50,000." */
function deliveryLines(ctx: DefaultPagesContext) {
  const money = (n: number) => formatShopCurrency(n, ctx.currency);
  return ctx.deliveryOptions.map((o) => {
    if (o.isPickup) return `${o.name}: free${o.etaText ? `, ${o.etaText.charAt(0).toLowerCase()}${o.etaText.slice(1)}` : ""}.`;
    const price = o.fee === 0 ? "free" : money(o.fee);
    const free = o.freeOver != null && o.fee > 0 ? ` Free on orders over ${money(o.freeOver)}.` : "";
    return `${o.name}: ${price}${o.etaText ? `, ${o.etaText.charAt(0).toLowerCase()}${o.etaText.slice(1)}` : ""}.${free}`;
  });
}

const fill = (text: string, ctx: DefaultPagesContext) => text.replace(/\{name\}/g, ctx.storeName);

export function buildDefaultPages(ctx: DefaultPagesContext): DefaultPage[] {
  const words = wordsFor(ctx);
  const where = [ctx.city, ctx.state].filter(Boolean).join(", ");
  const [hero, ...more] = ctx.images;
  const delivery = deliveryLines(ctx);
  const replyTime = "within one working day";

  const about: DefaultPage = {
    systemKey: "about",
    title: "About us",
    slug: "about",
    showInMenu: true,
    seoTitle: `About ${ctx.storeName}`,
    seoDescription: `${ctx.storeName}: ${words.things}${where ? ` from ${where}` : ""}. ${words.aboutLead}`.slice(0, 160),
    body: [
      { type: "hero", eyebrow: "Our story", heading: `Welcome to ${ctx.storeName}`, lead: words.aboutLead, image: hero ?? null },
      {
        type: "split",
        eyebrow: "How it started",
        heading: where ? `${words.things.charAt(0).toUpperCase()}${words.things.slice(1)}, from ${where}` : "Why we do what we do",
        text: fill(words.story, ctx),
        images: more.slice(0, 3),
        imageSide: "left",
      },
      { type: "steps", eyebrow: "What you can expect", heading: "Our promise to you", items: words.promises },
      {
        type: "cta",
        heading: "Find something you'll love",
        text: "Take a look at what's new, or get in touch if you'd like help choosing.",
        buttons: [
          { label: "Shop now", link: "shop" },
          { label: "Contact us", link: "page:contact" },
        ],
      },
    ],
  };

  const quickFaqs = [
    { question: "How long does delivery take?", answer: delivery.length ? `It depends on where you are. ${delivery.slice(0, 2).join(" ")}` : "Delivery options and times are shown at checkout once you enter your address." },
    { question: "How can I pay?", answer: howToPay(ctx) },
    { question: "Can I return something?", answer: "If something isn't right with your order, contact us within 7 days of delivery and we'll put it right." },
  ];

  const contact: DefaultPage = {
    systemKey: "contact",
    title: "Contact us",
    slug: "contact",
    showInMenu: true,
    seoTitle: `Contact ${ctx.storeName}`,
    seoDescription: `Get in touch with ${ctx.storeName} about an order, a product or delivery. We reply ${replyTime}.`,
    body: [
      { type: "hero", eyebrow: "", heading: "Get in touch", lead: "Questions about an order, a product or delivery? Send us a message and we'll get back to you.", image: null },
      { type: "contact_form", heading: "Send us a message", intro: "", hours: "", replyTime },
      { type: "heading", text: "Quick answers" },
      { type: "faq", items: quickFaqs },
    ],
  };

  const faqs: DefaultPage = {
    systemKey: "faqs",
    title: "Frequently asked questions",
    slug: "faqs",
    showInMenu: false,
    seoTitle: `FAQs | ${ctx.storeName}`,
    seoDescription: `Answers to common questions about ordering from ${ctx.storeName}: delivery, payment, returns and more.`,
    body: [
      { type: "hero", eyebrow: "Help", heading: "Frequently asked questions", lead: "Everything you need to know about ordering from us. Can't find your answer? Get in touch.", image: null },
      {
        type: "faq",
        items: [
          ...quickFaqs,
          { question: "How do I track my order?", answer: "We'll email you when your order is on its way, with tracking details when there are some." },
          { question: "Can I change or cancel my order?", answer: "Contact us as soon as you can. If your order hasn't been sent yet, we'll do our best to change or cancel it." },
          ...words.faqs,
        ],
      },
      { type: "cta", heading: "Still have a question?", text: `We reply ${replyTime}.`, buttons: [{ label: "Contact us", link: "page:contact" }] },
    ],
  };

  const deliveryReturns: DefaultPage = {
    systemKey: "delivery-returns",
    title: "Delivery and returns",
    slug: "delivery-returns",
    showInMenu: false,
    seoTitle: `Delivery and returns | ${ctx.storeName}`,
    seoDescription: `How ${ctx.storeName} delivers, what it costs, and how returns work.`,
    body: [
      { type: "hero", eyebrow: "Help", heading: "Delivery and returns", lead: "Where we deliver, what it costs, and what to do if something isn't right.", image: null },
      { type: "heading", text: "Delivery" },
      delivery.length
        ? { type: "list", items: delivery }
        : { type: "text", text: "Delivery options and costs are shown at checkout once you enter your address." },
      { type: "text", text: "We'll email you when your order is on its way. If you have any questions about your delivery, please contact us." },
      { type: "heading", text: "Returns" },
      {
        type: "text",
        text: "If something isn't right with your order, contact us within 7 days of delivery. Tell us your order number and what's wrong, and we'll explain what to do next.\n\nItems should be unused, in their original condition and packaging. Once we've received and checked your return, we'll arrange a refund or exchange.",
      },
      { type: "heading", text: "Refunds" },
      { type: "text", text: "Refunds go back the way you paid. Card refunds can take a few working days to show in your account, depending on your bank." },
    ],
  };

  const privacy: DefaultPage = {
    systemKey: "privacy",
    title: "Privacy policy",
    slug: "privacy",
    showInMenu: false,
    seoTitle: `Privacy policy | ${ctx.storeName}`,
    seoDescription: `How ${ctx.storeName} uses and protects your personal information.`,
    body: [
      { type: "hero", eyebrow: "Legal", heading: "Privacy policy", lead: `How ${ctx.storeName} looks after your personal information.`, image: null },
      { type: "heading", text: "What we collect" },
      { type: "text", text: "When you order, we collect your name, email address, phone number and delivery address. When you contact us, we keep your message and how to reply to you." },
      { type: "heading", text: "How we use it" },
      { type: "list", items: ["To process, deliver and support your orders.", "To reply to your messages.", "To send you marketing, only if you've agreed to it. You can stop at any time."] },
      { type: "heading", text: "Who we share it with" },
      {
        type: "text",
        text: "Only the people who help us run the shop: Paystack, which processes card payments securely (we never see your card details); the delivery partners who bring your order; and XYVOO, the platform our shop runs on. We never sell your information.",
      },
      { type: "heading", text: "Cookies" },
      { type: "text", text: "We use cookies that are needed for the shop to work, such as remembering your basket. We only use analytics cookies if you agree to them." },
      { type: "heading", text: "Your rights" },
      { type: "text", text: "You can ask to see, correct or delete the personal information we hold about you. Contact us and we'll help." },
      { type: "contact" },
    ],
  };

  const terms: DefaultPage = {
    systemKey: "terms",
    title: "Terms of sale",
    slug: "terms",
    showInMenu: false,
    seoTitle: `Terms of sale | ${ctx.storeName}`,
    seoDescription: `The terms that apply when you buy from ${ctx.storeName}.`,
    body: [
      { type: "hero", eyebrow: "Legal", heading: "Terms of sale", lead: `The terms that apply when you buy from ${ctx.storeName}.`, image: null },
      { type: "heading", text: "Orders" },
      { type: "text", text: "When you place an order, we'll email you to confirm we've received it. Your order is accepted when we confirm your payment, or when we send it if you pay on delivery." },
      { type: "heading", text: "Prices and payment" },
      { type: "text", text: `Prices are shown in ${ctx.currency} and include any VAT we charge, unless checkout shows it separately. ${howToPay(ctx)}` },
      { type: "heading", text: "Delivery" },
      { type: "text", text: "Delivery costs and options are shown at checkout. Delivery times are estimates; we'll keep you updated if anything changes." },
      { type: "heading", text: "Returns and refunds" },
      { type: "text", text: "Our delivery and returns page explains how to return an item and how refunds work." },
      { type: "heading", text: "Questions" },
      { type: "text", text: "If you have a question about these terms or your order, please contact us." },
      { type: "contact" },
    ],
  };

  return [about, contact, faqs, deliveryReturns, privacy, terms];
}
