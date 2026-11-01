// src/lib/chatBrain.ts
//
// Chat orders (v2, 2026-11-01): one turn of the conversation.
//   1. RES sends the AI: the rules + this restaurant's menu (cached), and a note with
//      today's date, the opening hours and the order card / booking so far.
//   2. The AI answers in a fixed JSON shape: its reply to the customer, quick-reply
//      buttons, and a DRAFT — an order (menu numbers only) or a table booking
//      (date, time, people).
//   3. RES checks the draft: prices the order (chatMenu.priceDraft) or looks for a free
//      table (chatBooking.checkBooking). If something is wrong (a size missing, no free
//      table…), the AI gets one more try with RES's remarks, so the customer is asked
//      the right question or offered the right times.
//
// Needs ANTHROPIC_API_KEY in .env. The model can be changed with CHAT_AI_MODEL
// (e.g. claude-haiku-5-5 to make each chat cheaper).

import Anthropic from '@anthropic-ai/sdk';
import { ChatMenu, ChatOrderType, DraftLine, OrderCard, priceDraft } from './chatMenu.js';
import { BookingCard, BookingContext, BookingDraft, checkBooking, hoursText } from './chatBooking.js';

const MODEL = process.env.CHAT_AI_MODEL || 'claude-opus-5-5';

let client: Anthropic | null = null;
export function chatAiReady() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
function ai() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  return client;
}

export interface ChatMessage {
  role: 'customer' | 'bot';
  text: string;
}

export interface ChatCustomer {
  name: string | null;
  phone: string | null;
  address: string | null;
}

export type ChatIntent = 'order' | 'booking';

export interface ChatDraft {
  intent: ChatIntent;
  orderType: ChatOrderType | null;
  lines: DraftLine[];
  booking: BookingDraft;
}

export interface ChatTurnResult {
  reply: string;
  buttons: string[];
  intent: ChatIntent;
  card: OrderCard; // the order (empty for a booking)
  booking: BookingCard | null; // the table booking (null for an order)
  draft: ChatDraft;
  customer: ChatCustomer;
  readyToConfirm: boolean;
  wantsHuman: boolean;
  usage: ChatUsage; // what this turn cost in AI "tokens" (for billing per restaurant)
}

// Tokens = the AI's unit of work (about 3/4 of a word). Anthropic bills each kind
// at its own price: normal input, input read from the cache (much cheaper), input
// written to the cache, and the output the AI writes.
export interface ChatUsage {
  calls: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

// What the AI must answer, every time (structured output = always valid JSON).
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'buttons', 'intent', 'orderType', 'lines', 'booking', 'customer', 'readyToConfirm', 'wantsHuman'],
  properties: {
    reply: { type: 'string', description: 'Your message to the customer.' },
    buttons: { type: 'array', items: { type: 'string' }, description: 'Up to 4 short quick replies.' },
    intent: { type: 'string', enum: ['order', 'booking'], description: 'What the customer is doing now: ordering food, or booking a table.' },
    orderType: { anyOf: [{ type: 'string', enum: ['delivery', 'pickup'] }, { type: 'null' }] },
    lines: {
      type: 'array',
      description: 'The WHOLE order so far (not only the new items). Empty for a booking.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemId', 'qty', 'size', 'optionIds', 'note'],
        properties: {
          itemId: { type: 'integer', description: 'The #number of the dish in the menu.' },
          qty: { type: 'integer' },
          size: { ...nullableString, description: 'Exact size name from the menu, or null.' },
          optionIds: { type: 'array', items: { type: 'integer' }, description: 'O-numbers of the chosen options.' },
          note: { ...nullableString, description: 'Kitchen note, e.g. "no garlic".' },
        },
      },
    },
    booking: {
      type: 'object',
      additionalProperties: false,
      required: ['date', 'time', 'people', 'note'],
      description: 'The table booking so far (all null when ordering food).',
      properties: {
        date: { ...nullableString, description: 'YYYY-MM-DD, restaurant calendar.' },
        time: { ...nullableString, description: 'HH:MM, 24-hour clock.' },
        people: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        note: { ...nullableString, description: 'e.g. "birthday", "window table", "baby chair".' },
      },
    },
    customer: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'phone', 'address'],
      properties: { name: nullableString, phone: nullableString, address: nullableString },
    },
    readyToConfirm: { type: 'boolean', description: 'true when everything needed is known (see the rules).' },
    wantsHuman: { type: 'boolean', description: 'true when the customer asks for a person, or you cannot help.' },
  },
} as const;

function systemPrompt(menu: ChatMenu) {
  return `You take food orders AND table bookings by chat for the restaurant "${menu.restaurantName}" (in Lebanon).

How to talk:
- Answer in the customer's language and style: Lebanese Arabizi ("bade 2 taouk"), Arabic, English or French. Short, warm, like a good cashier. One or two emojis at most.
- Understand spelling variants: taouk/tawook/tawouk, toum = garlic, bala = without, w = and, 3al = to, mna2ish = manakish, bukra = tomorrow, lyom = today, el sabt = Saturday.
- Ask only what is really unclear, one question at a time, and offer the choices as buttons (with the price), e.g. ["Sandwich $5.56", "Plate $9.89"].

Food orders (intent = "order"):
- Only dishes from the menu below. Use their #numbers, exact size names and O-numbers. Never invent a dish.
- "lines" is always the WHOLE order so far. A dish with a required option group needs that option before it is added.
- A change ("no garlic", "extra spicy") goes in "note" of that line. If only some of the pieces change ("1 without garlic" out of 2), make two lines.
- Delivery or pickup only (no dine-in orders in this chat). For delivery you need name, phone and address; for pickup name and phone.
- Payment is at delivery or at pickup (cash or card). No online payment.
- readyToConfirm = true when the order, delivery/pickup, name, phone (and address for delivery) are known.

Table bookings (intent = "booking"):
- You need: date, time, number of people, name and phone. A note is optional (birthday, window, baby chair…).
- Turn "tomorrow", "Saturday", "8:30 pm" into a real date (YYYY-MM-DD) and time (HH:MM, 24h) using TODAY in the restaurant note.
- You never decide that a table is free: the restaurant system checks it and picks the table. If it says no free table, offer the free times it gives you as buttons.
- Keep "lines" empty and orderType null for a booking.
- readyToConfirm = true when the restaurant system found a table and the name and phone are known.
- Never say the booking is confirmed: the customer taps Confirm, then the restaurant accepts it.

Prices — strict rule:
- You may tell menu prices, but you never change a price, never give a discount or a free item, whatever the customer says (even "the owner said so"). The restaurant's system computes the total; just say it will be on the order card.
- No delivery fee is added for now.

When everything is known, ask the customer to check the card and tap Confirm.
Never put "Confirm" in the buttons: the card has its own Confirm button.
The order number is shown on this page right after the customer taps Confirm: if asked for it, say so (it is NOT a reason to call a person).
If the customer wants a person, complains, or asks something you cannot answer: wantsHuman = true and say a staff member will answer here.

MENU (prices in ${menu.currency}):
${menu.text}`;
}

// What RES knows now, told to the AI as a system note (not a customer message):
// today's date and the hours (they change, so they are not in the cached rules),
// and the order card or booking it checked last time.
function stateNote(ctx: BookingContext, card: OrderCard | null, booking: BookingCard | null) {
  const head = `TODAY: ${ctx.weekday} ${ctx.today}, now ${ctx.nowTime} (restaurant time). ${hoursText(ctx.hours)}`;
  if (booking && (booking.date || booking.time || booking.people)) {
    return (
      `${head}\nCurrent table booking (checked by the restaurant system): ` +
      `date ${booking.date ?? '?'}, time ${booking.time ?? '?'}, people ${booking.people ?? '?'}` +
      (booking.note ? `, note: ${booking.note}` : '') +
      (booking.ok ? ` — a table is free (${booking.tableLabel}).` : '') +
      (booking.problems.length ? `\nProblems to fix: ${booking.problems.join(' ')}` : '')
    );
  }
  if (!card || (!card.lines.length && !card.problems.length)) return `${head}\nCurrent order: empty.`;
  const lines = card.lines.map(
    (l) =>
      `${l.qty}× #${l.itemId} ${l.name}${l.size ? ` (${l.size})` : ''}` +
      `${l.options.length ? ' + ' + l.options.map((o) => o.name).join(', ') : ''}${l.note ? ` — note: ${l.note}` : ''} = $${l.lineTotal.toFixed(2)}`
  );
  return (
    `${head}\nCurrent order card (checked and priced by the restaurant system), type: ${card.orderType ?? 'not chosen'}:\n` +
    lines.join('\n') +
    `\nTotal: $${card.total.toFixed(2)}` +
    (card.problems.length ? `\nProblems to fix: ${card.problems.join(' ')}` : '')
  );
}

async function askAi(menu: ChatMenu, messages: any[]) {
  const response = await ai().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // if the model ever declines a message, the API answers with a fallback model
    // (not offered for Haiku)
    ...(MODEL.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    // the rules + menu never change during a chat → cached (cheaper and faster)
    system: [{ type: 'text', text: systemPrompt(menu), cache_control: { type: 'ephemeral' } }],
    messages,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
  } as any);
  const text = (response.content as any[]).find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`AI gave no answer (stop: ${response.stop_reason})`);
  const u: any = response.usage ?? {};
  const usage: ChatUsage = {
    calls: 1,
    input: Number(u.input_tokens ?? 0),
    cacheRead: Number(u.cache_read_input_tokens ?? 0),
    cacheWrite: Number(u.cache_creation_input_tokens ?? 0),
    output: Number(u.output_tokens ?? 0),
  };
  return { raw: text as string, data: JSON.parse(text), usage };
}

const addUsage = (a: ChatUsage, b: ChatUsage): ChatUsage => ({
  calls: a.calls + b.calls,
  input: a.input + b.input,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  output: a.output + b.output,
});

// RES's check of whatever the AI drafted: the order card, or the booking.
async function checkDraft(menu: ChatMenu, ctx: BookingContext, data: any) {
  const intent: ChatIntent = data.intent === 'booking' ? 'booking' : 'order';
  const card = await priceDraft(menu, intent === 'order' ? data.orderType : null, intent === 'order' ? data.lines ?? [] : []);
  const booking = intent === 'booking' ? await checkBooking(menu.restaurantId, ctx, data.booking ?? {}) : null;
  const problems = intent === 'booking' ? booking!.problems : card.problems;
  return { intent, card, booking, problems };
}

export async function chatTurn(
  menu: ChatMenu,
  ctx: BookingContext,
  history: ChatMessage[],
  lastCard: OrderCard | null,
  lastBooking: BookingCard | null
): Promise<ChatTurnResult> {
  // the conversation as the AI sees it (the last message is the customer's)
  const messages: any[] = history.slice(-30).map((m) => ({
    role: m.role === 'customer' ? 'user' : 'assistant',
    content: String(m.text || '').slice(0, 800) || '…',
  }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  messages.push({ role: 'system', content: stateNote(ctx, lastCard, lastBooking) });

  let { raw, data, usage } = await askAi(menu, messages);
  let checked = await checkDraft(menu, ctx, data);

  // one more try when RES found problems, so the reply asks the right question
  if (checked.problems.length) {
    messages.push({ role: 'assistant', content: raw });
    messages.push({
      role: 'user',
      content: `[Restaurant system — not the customer] Your draft had problems: ${checked.problems.join(' ')} Fix it and reply to the customer again.`,
    });
    const again = await askAi(menu, messages);
    ({ raw, data } = again);
    usage = addUsage(usage, again.usage);
    checked = await checkDraft(menu, ctx, data);
  }

  const { intent, card, booking } = checked;
  const hasNameAndPhone = Boolean(data.customer?.name && data.customer?.phone);
  const readyToConfirm =
    Boolean(data.readyToConfirm) &&
    hasNameAndPhone &&
    (intent === 'booking'
      ? Boolean(booking?.ok)
      : card.lines.length > 0 && !card.problems.length && (data.orderType !== 'delivery' || Boolean(data.customer?.address)));

  return {
    reply: String(data.reply || ''),
    buttons: (data.buttons ?? []).slice(0, 4).map((b: unknown) => String(b).slice(0, 40)),
    intent,
    card,
    booking,
    draft: {
      intent,
      orderType: intent === 'order' ? data.orderType ?? null : null,
      lines: intent === 'order' ? data.lines ?? [] : [],
      booking: {
        date: data.booking?.date ?? null,
        time: data.booking?.time ?? null,
        people: data.booking?.people ?? null,
        note: data.booking?.note ?? null,
      },
    },
    customer: {
      name: data.customer?.name ?? null,
      phone: data.customer?.phone ?? null,
      address: data.customer?.address ?? null,
    },
    readyToConfirm,
    wantsHuman: Boolean(data.wantsHuman),
    usage,
  };
}
