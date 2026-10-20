// Local simulation: 10 restaurants, 50 reservation chats and 50 pizza-order chats against the
// real whatsapp-webhook Edge Function (one local Deno instance per restaurant, Twilio-signed requests).
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";

const REST = process.env.SIM_REST_URL || "http://127.0.0.1:54321";
const KEY = process.env.SIM_SERVICE_KEY || readFileSync("/tmp/sim_service_key", "utf8").trim();
const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const BASE_PORT = 9001;
const OUT = process.env.SIM_OUT || "/tmp/sim-transcript.json";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };

// Supabase serves PostgREST under /rest/v1; this stands in for the API gateway.
const GATEWAY_PORT = 54331;
function startGateway() {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const upstream = await fetch(`${REST}${req.url.replace(/^\/rest\/v1/, "")}`, {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !["host", "connection", "content-length"].includes(k))),
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });
    const out = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k))));
    res.end(out);
  });
  return new Promise((resolve) => server.listen(GATEWAY_PORT, "127.0.0.1", () => resolve(server)));
}

const names = ["Da Mario", "Trattoria Sole", "Pizzeria Napoli", "Gasthaus Alpenrose", "Osteria Luna", "La Piazza", "Ristorante Dolomiti", "Pizza & Vino", "Il Forno", "Stube Edelweiss"];
const restaurants = names.map((name, i) => ({ restaurant_id: `sim-rest-${String(i + 1).padStart(2, "0")}`, name }));
const seatLayout = [2, 2, 4, 4, 4, 6, 6, 8];

async function rest(path, init = {}) {
  const res = await fetch(`${REST}/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function seed() {
  const ids = restaurants.map((r) => `"${r.restaurant_id}"`).join(",");
  await rest(`restaurants?restaurant_id=in.(${ids})`, { method: "DELETE" });
  await rest("restaurants", {
    method: "POST",
    body: JSON.stringify(restaurants.map((r) => ({
      ...r,
      whatsapp_ordering_enabled: true,
      whatsapp_ordering_menu_url: `https://example.com/menu/${r.restaurant_id}`,
    }))),
  });
  await rest("tables", {
    method: "POST",
    body: JSON.stringify(restaurants.flatMap((r) => seatLayout.map((seats, i) => ({ restaurant_id: r.restaurant_id, table_number: i + 1, seats })))),
  });
}

function startWebhooks() {
  return restaurants.map((r, i) => {
    const port = BASE_PORT + i;
    const url = `http://127.0.0.1:${port}/`;
    const child = spawn("deno", ["run", "-A", "supabase/functions/whatsapp-webhook/index.ts"], {
      env: {
        ...process.env,
        DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`,
        SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
        SUPABASE_SERVICE_ROLE_KEY: KEY,
        RESTAURANT_ID: r.restaurant_id,
        TWILIO_AUTH_TOKEN: TOKEN,
        TWILIO_WEBHOOK_URL: url,
        RESTAURANT_TIMEZONE: "Europe/Rome",
        WHATSAPP_LANGUAGE: "it",
      },
      stdio: "ignore",
    });
    return { child, url, port };
  });
}

async function waitReady(instances) {
  for (const { url } of instances) {
    for (let n = 0; n < 60; n++) {
      try { await fetch(url); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
  }
}

let sidCounter = 0;
async function send(instance, phone, body, name) {
  const params = { From: `whatsapp:${phone}`, Body: body, MessageSid: `SM${String(++sidCounter).padStart(32, "0")}`, ProfileName: name };
  let signed = instance.url;
  for (const k of Object.keys(params).sort()) signed += k + params[k];
  const sig = createHmac("sha1", TOKEN).update(signed).digest("base64");
  const res = await fetch(instance.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": sig },
    body: new URLSearchParams(params).toString(),
  });
  const xml = await res.text();
  const reply = [...xml.matchAll(/<Message>([\s\S]*?)<\/Message>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join("\n");
  return { status: res.status, reply };
}

function dateIn(days) {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("day")}/${g("month")}/${g("year")}`;
}

const firstNames = ["Anna", "Luca", "Maria", "Paul", "Sofia", "Jonas", "Giulia", "Marco", "Lena", "Tobias", "Elena", "Franz", "Sara", "Matteo", "Julia"];
const pizzas = ["Margherita", "Diavola", "Quattro Formaggi", "Prosciutto e Funghi", "Capricciosa", "Marinara", "Salame Piccante", "Bufala"];
const pick = (arr, i) => arr[i % arr.length];

function bookingScript(i) {
  const lang = ["en", "it", "de"][i % 3];
  const guests = 2 + (i % 5);
  const date = dateIn(1 + (i % 6));
  const time = ["12:00", "12:30", "13:00", "18:30", "19:00", "19:30", "20:00", "20:30"][i % 8];
  const name = pick(firstNames, i);
  const first = {
    en: `Hi, I'd like to book a table for ${guests} people on ${date} at ${time}`,
    it: `Buongiorno, vorrei prenotare un tavolo per ${guests} persone il ${date} alle ${time}`,
    de: `Hallo, ich möchte einen Tisch für ${guests} Personen am ${date} um ${time} reservieren`,
  }[lang];
  return { kind: "booking", lang, name, messages: [first], answerName: name, details: { guests, date, time } };
}

function orderScript(i) {
  const lang = ["de", "it", "en"][i % 3];
  const name = pick(firstNames, i + 5);
  const a = `${1 + (i % 3)}x ${pick(pizzas, i)}`;
  const b = `${1 + (i % 2)}x ${pick(pizzas, i + 3)}`;
  const start = { de: "Bestellung:", it: "Ordine:", en: "Order:" }[lang];
  const done = { de: "FERTIG", it: "FINE", en: "DONE" }[lang];
  const extra = { de: "mit extra Mozzarella", it: "con mozzarella extra", en: "with extra mozzarella" }[lang];
  return { kind: "order", lang, name, messages: [`${start} ${a}`, `${b} ${extra}`, done], answerName: name, details: { items: [a, b] } };
}

async function converse(script, instance, phone, restaurant) {
  const turns = [];
  const say = async (text) => {
    const { status, reply } = await send(instance, phone, text, script.name);
    turns.push({ customer: text, bot: reply, status });
    return { status, reply };
  };
  let last;
  for (const m of script.messages) last = await say(m);
  // Answer remaining prompts (guest name for bookings, pickup name for orders).
  for (let n = 0; n < 4 && last.status === 200; n++) {
    const ask = /\b(name|nome|namen)\b/i.test(last.reply) && /\?/.test(last.reply);
    if (!ask) break;
    last = await say(script.answerName);
  }
  return { ...script, phone, restaurant: restaurant.restaurant_id, turns };
}

async function main() {
  await seed();
  const gateway = await startGateway();
  const instances = startWebhooks();
  try {
    await waitReady(instances);
    const jobs = [];
    for (let i = 0; i < 100; i++) {
      const isBooking = i % 2 === 0;
      const idx = Math.floor(i / 2);
      const restaurantIndex = idx % 10;
      const script = isBooking ? bookingScript(idx) : orderScript(idx);
      const phone = `+39333${String(1000000 + i)}`;
      jobs.push(converse(script, instances[restaurantIndex], phone, restaurants[restaurantIndex]));
    }
    const results = await Promise.all(jobs);
    writeFileSync(OUT, JSON.stringify(results, null, 2));

    const ids = restaurants.map((r) => `"${r.restaurant_id}"`).join(",");
    const bookings = await rest(`bookings?restaurant_id=in.(${ids})&select=restaurant_id`, { headers: { Prefer: "count=exact" } });
    const orders = await rest(`whatsapp_orders?restaurant_id=in.(${ids})&select=restaurant_id,status`);
    const messages = await rest(`whatsapp_messages?restaurant_id=in.(${ids})&select=direction`);
    const failed = results.filter((r) => r.turns.some((t) => t.status !== 200 || !t.bot));
    console.log(JSON.stringify({
      restaurants: restaurants.length,
      conversations: results.length,
      bookingChats: results.filter((r) => r.kind === "booking").length,
      orderChats: results.filter((r) => r.kind === "order").length,
      bookingsInDb: bookings.length,
      ordersInDb: orders.length,
      messagesLogged: messages.length,
      chatsWithErrorOrEmptyReply: failed.length,
    }, null, 2));
  } finally {
    for (const { child } of instances) child.kill();
    gateway.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
