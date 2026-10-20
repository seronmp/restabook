type BookingSession = {
  phone_hash: string;
  stage: "idle" | "main_menu" | "party_size" | "date" | "time" | "customer_name" | "cancellation_select" | "cancellation_confirm" | "ordering" | "order_name";
  guests: number | null;
  booking_date: string | null;
  start_time: string | null;
  end_time: string | null;
  customer_name: string | null;
  cancellation_booking_id: string | null;
  cancellation_options: CancellationOption[];
  whatsapp_order_text: string | null;
  language: Language;
  last_message_sid: string | null;
  last_reply: string | null;
  human_until: string | null;
};

type CancellationOption = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  guests: number;
};

type Language = "en" | "it" | "de";

type RestResult = { data: any; error: any };

class RestQuery implements PromiseLike<RestResult> {
  private readonly filters: string[] = [];
  private selection = "*";
  private ordering: string | null = null;
  private limit: number | null = null;
  private requestMethod = "GET";
  private requestBody: Record<string, unknown> | null = null;
  private prefer: string | null = null;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly table: string;

  constructor(baseUrl: string, apiKey: string, table: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.table = table;
  }

  select(columns: string): this {
    this.selection = columns;
    return this;
  }

  eq(column: string, value: string | number): this {
    this.filters.push(`${column}=eq.${value}`);
    return this;
  }

  gte(column: string, value: string | number): this {
    this.filters.push(`${column}=gte.${value}`);
    return this;
  }

  lt(column: string, value: string): this {
    this.filters.push(`${column}=lt.${value}`);
    return this;
  }

  gt(column: string, value: string): this {
    this.filters.push(`${column}=gt.${value}`);
    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.ordering = `${column}.${options.ascending ? "asc" : "desc"}`;
    return this;
  }

  update(record: Record<string, unknown>): this {
    this.requestMethod = "PATCH";
    this.requestBody = record;
    this.prefer = "return=representation";
    return this;
  }

  async maybeSingle(): Promise<RestResult> {
    const result = await this.execute();
    return {
      data: result.data?.[0] || null,
      error: result.error,
    };
  }

  async insertIgnoringDuplicates(record: Record<string, unknown>, conflictColumn: string): Promise<RestResult> {
    return await this.send(`${this.baseUrl}/rest/v1/${this.table}?on_conflict=${conflictColumn}`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(record),
    });
  }

  async upsert(record: Record<string, unknown>): Promise<RestResult> {
    return await this.send(`${this.baseUrl}/rest/v1/${this.table}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(record),
    });
  }

  then<TResult1 = RestResult, TResult2 = never>(
    onfulfilled?: ((value: RestResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<RestResult> {
    const params = new URLSearchParams({ select: this.selection });
    for (const filter of this.filters) {
      const separator = filter.indexOf("=");
      params.append(filter.slice(0, separator), filter.slice(separator + 1));
    }
    if (this.ordering) params.set("order", this.ordering);
    if (this.limit !== null) params.set("limit", String(this.limit));

    return await this.send(`${this.baseUrl}/rest/v1/${this.table}?${params.toString()}`, {
      method: this.requestMethod,
      headers: this.prefer ? { Prefer: this.prefer } : undefined,
      body: this.requestBody ? JSON.stringify(this.requestBody) : undefined,
    });
  }

  private async send(url: string, options: RequestInit): Promise<RestResult> {
    const response = await fetch(url, {
      ...options,
      headers: {
        apikey: this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      let error: any;
      try {
        error = JSON.parse(body);
      } catch {
        error = { message: body || `Supabase request failed (${response.status})` };
      }
      error.status = response.status;
      return { data: null, error };
    }

    const body = await response.text();
    return { data: body ? JSON.parse(body) : null, error: null };
  }
}

class SupabaseRestClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  from(table: string): RestQuery {
    return new RestQuery(this.baseUrl, this.apiKey, table);
  }

  async rpc(functionName: string, args: Record<string, unknown>): Promise<RestResult> {
    const response = await fetch(`${this.baseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const body = await response.text();
      let error: any;
      try {
        error = JSON.parse(body);
      } catch {
        error = { message: body || `Supabase request failed (${response.status})` };
      }
      error.status = response.status;
      return { data: null, error };
    }

    const body = await response.text();
    return { data: body ? JSON.parse(body) : null, error: null };
  }
}

type BotMessages = {
  welcome: string;
  askGuests: string;
  invalidService: string;
  thanks: string;
  askDate: string;
  invalidGuests: string;
  invalidDate: string;
  askTime: string;
  invalidTime: string;
  pastTime: string;
  durationLimit: string;
  noCapacity: string;
  unavailable: string;
  available: (guests: number, date: string, time: string) => string;
  invalidName: string;
  booked: (name: string, table: string, date: string, start: string, end: string) => string;
  bookingConfirmed: string;
  notAvailableNow: string;
  cancelled: string;
  noUpcomingBooking: string;
  chooseCancellation: string;
  confirmCancellation: (booking: CancellationOption) => string;
  invalidCancellationChoice: string;
  cancellationKept: string;
  cancellationComplete: string;
  cancellationExpired: string;
  retry: string;
};

const messages: Record<Language, BotMessages> = {
  en: {
    welcome: "Welcome! What would you like to do?\n1. Reserve a table\n2. Order pizza",
    askGuests: "How many people should I reserve for?",
    invalidService: "Please reply 1 to reserve a table or 2 to order pizza.",
    thanks: "You're welcome! Just let me know if you'd like to make a reservation.",
    askDate: "What date would you like? Please use YYYY-MM-DD (for example, 2026-10-20).",
    invalidGuests: "Please enter the number of guests as a positive whole number.",
    invalidDate: "Please enter a valid future date in YYYY-MM-DD or DD/MM/YYYY format.",
    askTime: "What time would you like? Please send a time like 19:30, or just the hour like 19.",
    invalidTime: "Please enter a valid time in 24-hour HH:MM format.",
    pastTime: "That time has already passed today. Please choose a later time.",
    durationLimit: "A two-hour booking must finish before midnight. Please choose an earlier time.",
    noCapacity: "Sorry, we don't have a table with enough seats for that group size. Please contact the restaurant for help.",
    unavailable: "Sorry, no table is available for that party size at that time. Please send another time to try.",
    available: (guests: number, date: string, time: string) =>
      `A table is available for ${guests} on ${date} at ${time}. What name should I put the reservation under?`,
    invalidName: "Please send the name for the reservation (up to 100 characters).",
    booked: (name: string, table: string, date: string, start: string, end: string) =>
      `Thanks, ${name}! Your table ${table} is booked for ${date}, ${start}–${end}.`,
    bookingConfirmed: "Your reservation has been confirmed.",
    notAvailableNow: "Sorry, that table was just taken. Please send another time to try.",
    cancelled: "Your booking request has been cancelled. Send us a message whenever you'd like to start again.",
    noUpcomingBooking: "I couldn't find any upcoming reservations associated with this WhatsApp number.",
    chooseCancellation: "Which reservation would you like to cancel? Reply with its number:",
    confirmCancellation: (booking) =>
      `Cancel the reservation for ${booking.guests} on ${formatDate(booking.date)} from ${formatTime(booking.start_time)} to ${formatTime(booking.end_time)}? Reply YES to confirm or NO to keep it.`,
    invalidCancellationChoice: "Please reply with one of the reservation numbers shown.",
    cancellationKept: "Your reservation has not been cancelled.",
    cancellationComplete: "Your reservation has been cancelled.",
    cancellationExpired: "I couldn't cancel that reservation because it may already have been changed or cancelled. Please contact the restaurant if you need help.",
    retry: "Sorry, I couldn't process that just now. Please try sending your message again.",
  },
  it: {
    welcome: "Benvenuto! Cosa desidera fare?\n1. Prenotare un tavolo\n2. Ordinare una pizza",
    askGuests: "Per quante persone desidera prenotare?",
    invalidService: "Risponda 1 per prenotare un tavolo oppure 2 per ordinare una pizza.",
    thanks: "Prego! Mi scriva pure se desidera effettuare una prenotazione.",
    askDate: "Per quale data? Indichi la data nel formato AAAA-MM-GG (per esempio, 2026-10-20).",
    invalidGuests: "Indichi il numero di persone con un numero intero positivo.",
    invalidDate: "Indichi una data futura valida nel formato AAAA-MM-GG o GG/MM/AAAA.",
    askTime: "A che ora? Indichi l'orario, per esempio 19:30 oppure solo l'ora, per esempio 19.",
    invalidTime: "Indichi un orario valido nel formato 24 ore HH:MM.",
    pastTime: "Questo orario è già passato oggi. Scelga un orario successivo.",
    durationLimit: "La prenotazione di due ore deve terminare prima di mezzanotte. Scelga un orario precedente.",
    noCapacity: "Mi dispiace, non abbiamo un tavolo con posti sufficienti per questo gruppo. Contatti il ristorante per assistenza.",
    unavailable: "Mi dispiace, non ci sono tavoli disponibili per quel numero di persone a quell'ora. Indichi un altro orario.",
    available: (guests: number, date: string, time: string) =>
      `C'è un tavolo disponibile per ${guests} persone il ${date} alle ${time}. A che nome registriamo la prenotazione?`,
    invalidName: "Indichi il nome per la prenotazione (massimo 100 caratteri).",
    booked: (name: string, table: string, date: string, start: string, end: string) =>
      `Grazie, ${name}! Il tavolo ${table} è prenotato per il ${date}, dalle ${start} alle ${end}.`,
    bookingConfirmed: "La prenotazione è confermata.",
    notAvailableNow: "Mi dispiace, il tavolo è appena stato prenotato. Indichi un altro orario.",
    cancelled: "La richiesta di prenotazione è stata annullata. Ci scriva quando desidera riprovare.",
    noUpcomingBooking: "Non trovo prenotazioni future associate a questo numero WhatsApp.",
    chooseCancellation: "Quale prenotazione desidera annullare? Risponda con il relativo numero:",
    confirmCancellation: (booking) =>
      `Vuole annullare la prenotazione per ${booking.guests} persone del ${formatDate(booking.date)} dalle ${formatTime(booking.start_time)} alle ${formatTime(booking.end_time)}? Risponda SÌ per confermare o NO per mantenerla.`,
    invalidCancellationChoice: "Risponda con uno dei numeri delle prenotazioni indicati.",
    cancellationKept: "La prenotazione non è stata annullata.",
    cancellationComplete: "La prenotazione è stata annullata.",
    cancellationExpired: "Non posso annullare la prenotazione perché potrebbe essere già stata modificata o annullata. Contatti il ristorante per assistenza.",
    retry: "Mi dispiace, non riesco a elaborare la richiesta. Riprovi a inviare il messaggio.",
  },
  de: {
    welcome: "Willkommen! Was möchtest du tun?\n1. Tisch reservieren\n2. Pizza bestellen",
    askGuests: "Für wie viele Personen möchtest du reservieren?",
    invalidService: "Bitte antworte mit 1 für eine Tischreservierung oder 2 für eine Pizzabestellung.",
    thanks: "Gern geschehen! Wenn Sie reservieren möchten, schreiben Sie mir einfach.",
    askDate: "Für welches Datum? Bitte im Format JJJJ-MM-TT (zum Beispiel 2026-10-20).",
    invalidGuests: "Bitte geben Sie eine positive ganze Zahl für die Personenzahl ein.",
    invalidDate: "Bitte geben Sie ein gültiges zukünftiges Datum im Format JJJJ-MM-TT oder TT.MM.JJJJ ein.",
    askTime: "Um welche Uhrzeit? Zum Beispiel 19:30 oder nur die Stunde, zum Beispiel 19.",
    invalidTime: "Bitte geben Sie eine gültige Uhrzeit im 24-Stunden-Format HH:MM ein.",
    pastTime: "Diese Uhrzeit ist heute bereits vergangen. Bitte wählen Sie eine spätere Uhrzeit.",
    durationLimit: "Eine zweistündige Reservierung muss vor Mitternacht enden. Bitte wählen Sie eine frühere Uhrzeit.",
    noCapacity: "Leider haben wir keinen Tisch mit genügend Plätzen für diese Gruppe. Bitte kontaktieren Sie das Restaurant.",
    unavailable: "Leider ist zu dieser Zeit kein Tisch für diese Personenzahl frei. Bitte senden Sie eine andere Uhrzeit.",
    available: (guests: number, date: string, time: string) =>
      `Ein Tisch für ${guests} Personen ist am ${date} um ${time} verfügbar. Auf welchen Namen soll ich reservieren?`,
    invalidName: "Bitte senden Sie den Namen für die Reservierung (maximal 100 Zeichen).",
    booked: (name: string, table: string, date: string, start: string, end: string) =>
      `Danke, ${name}! Tisch ${table} ist am ${date} von ${start} bis ${end} reserviert.`,
    bookingConfirmed: "Ihre Reservierung ist bestätigt.",
    notAvailableNow: "Leider wurde der Tisch gerade reserviert. Bitte senden Sie eine andere Uhrzeit.",
    cancelled: "Ihre Reservierungsanfrage wurde abgebrochen. Schreiben Sie uns, wenn Sie neu starten möchten.",
    noUpcomingBooking: "Ich konnte keine zukünftige Reservierung finden, die mit dieser WhatsApp-Nummer verknüpft ist.",
    chooseCancellation: "Welche Reservierung möchten Sie stornieren? Antworten Sie mit der Nummer:",
    confirmCancellation: (booking) =>
      `Möchten Sie die Reservierung für ${booking.guests} Personen am ${formatDate(booking.date)} von ${formatTime(booking.start_time)} bis ${formatTime(booking.end_time)} stornieren? Antworten Sie zur Bestätigung mit JA oder mit NEIN, um sie zu behalten.`,
    invalidCancellationChoice: "Bitte antworten Sie mit einer der angezeigten Reservierungsnummern.",
    cancellationKept: "Ihre Reservierung wurde nicht storniert.",
    cancellationComplete: "Ihre Reservierung wurde storniert.",
    cancellationExpired: "Ich konnte diese Reservierung nicht stornieren. Sie wurde möglicherweise bereits geändert oder storniert. Bitte wenden Sie sich an das Restaurant.",
    retry: "Leider konnte ich Ihre Nachricht gerade nicht verarbeiten. Bitte versuchen Sie es erneut.",
  },
};

const requestedLanguage = (Deno.env.get("WHATSAPP_LANGUAGE") || "it").toLowerCase();
const defaultLanguage: Language = requestedLanguage === "en" || requestedLanguage === "de" ? requestedLanguage : "it";
const defaultText = messages[defaultLanguage];
const durationMinutes = 120;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character]!);
}

function twiml(message?: string, status = 200): Response {
  const content = message
    ? `<Response><Message>${xmlEscape(message)}</Message></Response>`
    : "<Response/>";
  return new Response(content, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verifyTwilioSignature(
  params: URLSearchParams,
  signature: string | null,
  authToken: string,
  webhookUrl: string,
): Promise<boolean> {
  if (!signature) return false;

  const keys = [...new Set([...params.keys()])].sort();
  let signedContent = webhookUrl;
  for (const key of keys) {
    const values = params.getAll(key).sort();
    signedContent += key + values.join("");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return safeEqual(signature, expected);
}

async function hashPhone(phone: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phone));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseDate(input: string): string | null {
  const value = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const localized = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(value);
  const year = iso ? Number(iso[1]) : localized ? Number(localized[3]) : NaN;
  const month = iso ? Number(iso[2]) : localized ? Number(localized[2]) : NaN;
  const day = iso ? Number(iso[3]) : localized ? Number(localized[1]) : NaN;
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    !Number.isInteger(year) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  const today = currentRestaurantDateTime().date;
  const result = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return result >= today ? result : null;
}

function parseRequestedDate(input: string): string | null {
  const value = input.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const now = currentRestaurantDateTime();
  const relativeDays: Record<string, number> = {
    oggi: 0,
    today: 0,
    heute: 0,
    heint: 0,
    heit: 0,
    hait: 0,
    domani: 1,
    tomorrow: 1,
    morgen: 1,
    morgn: 1,
    moang: 1,
  };
  const relative = Object.keys(relativeDays).find((word) =>
    new RegExp(`(?:^|\\b)${word}(?:$|\\b)`, "i").test(value)
  );
  if (relative) {
    const [year, month, day] = now.date.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + relativeDays[relative]));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  const weekdays: Record<string, number> = {
    sunday: 0, sonntag: 0, domenica: 0,
    monday: 1, montag: 1, lunedi: 1,
    tuesday: 2, dienstag: 2, martedi: 2,
    wednesday: 3, mittwoch: 3, mercoledi: 3,
    thursday: 4, donnerstag: 4, giovedi: 4,
    friday: 5, freitag: 5, venerdi: 5,
    saturday: 6, samstag: 6, sabato: 6,
  };
  const weekdayName = Object.keys(weekdays).find((day) =>
    new RegExp(`(?:^|\\b)${day}(?:$|\\b)`, "i").test(value)
  );
  if (weekdayName) {
    const [year, month, day] = now.date.split("-").map(Number);
    const today = new Date(Date.UTC(year, month - 1, day));
    let daysAhead = (weekdays[weekdayName] - today.getUTCDay() + 7) % 7;
    if (daysAhead === 0) daysAhead = 7;
    const date = new Date(Date.UTC(year, month - 1, day + daysAhead));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  const yearFirst = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(value);
  const localized = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/.exec(value);
  if (yearFirst) return parseDate(yearFirst[0]);
  if (localized) {
    const year = localized[3] ? Number(localized[3].length === 2 ? `20${localized[3]}` : localized[3]) : Number(now.date.slice(0, 4));
    const day = String(Number(localized[1])).padStart(2, "0");
    const month = String(Number(localized[2])).padStart(2, "0");
    return parseDate(`${year}-${month}-${day}`);
  }
  return null;
}

function detectLanguage(input: string): Language | null {
  const value = input.toLowerCase();
  const scores: Record<Language, number> = { en: 0, it: 0, de: 0 };
  const terms: Record<Language, string[]> = {
    en: [" today", " tomorrow", "people", " guests", "table", "booking", "reserve", "reservation", "have you got", "is there", "thank", "cancel"],
    it: [" oggi", " domani", "posso ", "ordinare", "persone", " posti", "tavolo", "prenot", "avete", "c'è", "per favore", "grazie", "annulla", "cancellare", "cancellazione"],
    de: [" heute", " heint", " heit", " hait", " morgen", " personen", "gäste", "platz", "plotz", "tisch", " reserv", "für ", " fur ", " fir ", "wia vui", "wia vill", "hobts", "habt ihr", "habt's", "leit", "leute", "danke", "donk", "dank", "stornier", "abbrechen", "absagen"],
  };
  for (const lang of ["en", "it", "de"] as const) {
    for (const term of terms[lang]) {
      if (value.includes(term)) scores[lang] += term.length > 6 ? 2 : 1;
    }
  }
  if (/\b(heint|heit|hait|morgn|moang|wia vui|wia vill|hobts|plotz|habt's|leitln|leit|fir|fur|i bin)\b/i.test(value)) {
    scores.de += 2;
  }
  if (scores.en === 0 && scores.it === 0 && scores.de === 0) return null;
  if (scores.de >= scores.it && scores.de >= scores.en) return "de";
  if (scores.it >= scores.en) return "it";
  return "en";
}

function isThankYou(input: string): boolean {
  const value = input.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .trim();
  return /^(?:(?:vielen|besten|herzlichen)\s+)?(?:danke(?:\s*(?:schoen|schon)|\s+(?:dir|ihnen))?|dank|donk|thank(?:s| you)(?:\s+(?:very much|a lot))?|thanks?(?:\s+(?:a lot|so much))?|grazie(?:\s+(?:mille|tante))?)$/i.test(value);
}

function parseGuests(input: string): number | null {
  const value = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const numberWords: Record<string, number> = {
    one: 1, a: 1, ein: 1, eine: 1, uno: 1, una: 1,
    two: 2, zwei: 2, zwoa: 2, due: 2,
    three: 3, drei: 3, tre: 3,
    four: 4, vier: 4, via: 4, quattro: 4,
    five: 5, funf: 5, cinque: 5,
    six: 6, sechs: 6, sei: 6,
    seven: 7, sieben: 7, sette: 7,
    eight: 8, acht: 8, otto: 8,
    nine: 9, neun: 9, nove: 9,
    ten: 10, zehn: 10, dieci: 10,
    eleven: 11, elf: 11, undici: 11,
    twelve: 12, zwolf: 12, dodici: 12,
  };
  const number = "(\\d{1,2}|" + Object.keys(numberWords).join("|") + ")";
  const markers = "(?:people|persons?|guests?|pax|pers(?:onen)?|leute|leit(?:ln)?|gäste|gaeste|posti|coperti)";
  const groupSize = /\b(?:zu\s+)?(zweit|dritt|viert|funft|sechst|siebt|acht|neunt|zehnt)\b/i.exec(value);
  if (groupSize) {
    const ordinal: Record<string, number> = {
      zweit: 2, dritt: 3, viert: 4, funft: 5, funt: 5,
      sechst: 6, siebt: 7, acht: 8, neunt: 9, zehnt: 10,
    };
    return ordinal[groupSize[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] || null;
  }
  const match = new RegExp(`\\b${number}\\s*${markers}\\b`, "i").exec(value)
    || new RegExp(`\\b(?:for|für|fur|fir|per)\\s+${number}\\b`, "i").exec(value);
  if (match) {
    const raw = match[1].toLowerCase();
    const guests = /^\d+$/.test(raw) ? Number(raw) : numberWords[raw];
    return Number.isSafeInteger(guests) && guests > 0 ? guests : null;
  }
  return null;
}

function parseRequestedTime(input: string): string | null {
  const value = input.toLowerCase();
  const clock = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(value);
  if (clock) {
    return `${String(Number(clock[1])).padStart(2, "0")}:${clock[2]}`;
  }
  const cuedClock = /\b(?:um|at|alle|verso|gegen)\s*([01]?\d|2[0-3])[.:]([0-5]\d)\b/i.exec(value);
  if (cuedClock) {
    return `${String(Number(cuedClock[1])).padStart(2, "0")}:${cuedClock[2]}`;
  }
  const halfHour = /\bhalb\s+(ein|eins|zwei|zwoa|drei|vier|funf|fünf|sechs|sieben|acht|neun|zehn|\d{1,2})\b/i.exec(value);
  if (halfHour) {
    const hours: Record<string, number> = {
      ein: 1, eins: 1, zwei: 2, zwoa: 2, drei: 3, vier: 4,
      funf: 5, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
    };
    const hour = /^\d+$/.test(halfHour[1]) ? Number(halfHour[1]) : hours[halfHour[1]];
    if (hour >= 1 && hour <= 12) return `${String((hour + 11) % 12).padStart(2, "0")}:30`;
  }
  const cuedHour = /\b(?:um|at|alle|verso|gegen)\s*([01]?\d|2[0-3])\b/i.exec(value);
  if (cuedHour) {
    return `${String(Number(cuedHour[1])).padStart(2, "0")}:00`;
  }
  const colloquial = /\b(?:um|at|alle|gegen|verso)?\s*([01]?\d|2[0-3])\s*(uhr|h|i|am|pm)\b/i.exec(value);
  if (!colloquial) return null;

  let hour = Number(colloquial[1]);
  const suffix = colloquial[2].toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if ((value.includes("abends") || value.includes("sera") || value.includes("evening")) && hour < 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:00`;
}

function parseStandaloneHour(input: string): string | null {
  const match = /^(?:[01]?\d|2[0-3])$/.exec(input.trim());
  return match ? `${String(Number(match[0])).padStart(2, "0")}:00` : null;
}

function parseStandaloneGuests(input: string): number | null {
  const match = /^\d{1,2}$/.exec(input.trim());
  if (!match) return null;
  const guests = Number(match[0]);
  return guests > 0 ? guests : null;
}

function parseRequestedName(input: string): string | null {
  const patterns = [
    /\b\d{1,2}:[0-5]\d\s+([\p{Lu}][\p{L}'-]*(?:\s+[\p{Lu}][\p{L}'-]*)?)\s*$/u,
    /(?:my name is|i am|i'm|name is)\s+([\p{L}][\p{L}' -]{0,98})/iu,
    /(?:ich hei(?:ß|ss)e|ich bin|i bin|bin der|bin die|name ist)\s+([\p{L}][\p{L}' -]{0,98})/iu,
    /(?:mi chiamo|sono|nome:)\s+([\p{L}][\p{L}' -]{0,98})/iu,
    /(?:auf den namen|reservierung auf|prenotazione a nome di)\s+([\p{L}][\p{L}' -]{0,98})/iu,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(input.trim());
    if (match) {
      const name = match[1].trim().replace(/^(?:der|die|da|dei|the)\s+/i, "").replace(/[?.!,;]+$/, "");
      return name.slice(0, 100);
    }
  }
  return null;
}

function parseBookingDetails(input: string): Partial<Pick<BookingSession, "guests" | "booking_date" | "start_time" | "customer_name">> {
  return {
    guests: parseGuests(input) ?? undefined,
    booking_date: parseRequestedDate(input) ?? undefined,
    start_time: parseRequestedTime(input) ?? undefined,
    customer_name: parseRequestedName(input) ?? undefined,
  };
}

function currentRestaurantDateTime(): { date: string; time: string } {
  const timezone = Deno.env.get("RESTAURANT_TIMEZONE") || "Europe/Rome";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

function parseTime(input: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(input.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

function addDuration(start: string): string | null {
  const [hours, minutes] = start.split(":").map(Number);
  const endMinutes = hours * 60 + minutes + durationMinutes;
  if (endMinutes >= 24 * 60) return null;
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
}

function formatDate(date: string): string {
  return date.split("-").reverse().join("/");
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function isCancellationRequest(input: string): boolean {
  return /\bcancel(?:lation)?\b|\bannull\w*|\bcancell\w*|\bstorn\w*|\babsag\w*|\babbrech\w*/i.test(input);
}

function isAffirmative(input: string): boolean {
  return /^(?:yes|y|yeah|yep|si|sì|s|ja|ok|okay|confermo|bestätigen)[.! ]*$/i.test(input.trim());
}

function isNegative(input: string): boolean {
  return /^(?:no|n|nope|nein|non|nein danke)[.! ]*$/i.test(input.trim());
}

function defaultSession(phoneHash: string, language = defaultLanguage): BookingSession {
  return {
    phone_hash: phoneHash,
    stage: "idle",
    guests: null,
    booking_date: null,
    start_time: null,
    end_time: null,
    customer_name: null,
    cancellation_booking_id: null,
    cancellation_options: [],
    whatsapp_order_text: null,
    language,
    last_message_sid: null,
    last_reply: null,
    human_until: null,
  };
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  let onReply: ((message: string) => void) | null = null;
  let flushLogs: (() => Promise<unknown>) | null = null;
  const respond = (message?: string, status = 200) => {
    if (message && status === 200) onReply?.(message);
    if (flushLogs) (globalThis as any).EdgeRuntime?.waitUntil(flushLogs());
    console.log("WhatsApp webhook response", {
      requestId,
      status,
      includesMessage: Boolean(message),
    });
    return twiml(message, status);
  };
  console.log("WhatsApp webhook request", { requestId, method: req.method });
  if (req.method !== "POST") return respond(undefined, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const restaurantId = requiredEnv("RESTAURANT_ID");
    const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
    const webhookUrl = requiredEnv("TWILIO_WEBHOOK_URL");

    if (!req.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
      console.error("Unexpected Twilio content type", {
        requestId,
        contentType: req.headers.get("content-type"),
      });
      return respond(undefined, 415);
    }

    const params = new URLSearchParams(await req.text());
    const isValid = await verifyTwilioSignature(
      params,
      req.headers.get("x-twilio-signature"),
      authToken,
      webhookUrl,
    );
    if (!isValid) {
      console.error("Twilio signature verification failed", { requestId });
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    const sender = params.get("From") || "";
    const messageSid = params.get("MessageSid") || "";
    const incomingText = (params.get("Body") || "").trim().slice(0, 500);
    const customerName = (params.get("ProfileName") || "").trim().slice(0, 100) || null;
    if (!/^whatsapp:\+\d{7,15}$/.test(sender) || !messageSid) {
      console.error("Twilio message is missing a valid sender or message SID", {
        requestId,
        hasSender: Boolean(sender),
        hasMessageSid: Boolean(messageSid),
      });
      return respond();
    }

    const supabase = new SupabaseRestClient(supabaseUrl, serviceRoleKey);
    const { data: restaurantSettings, error: restaurantSettingsError } = await supabase
      .from("restaurants")
      .select("whatsapp_ordering_enabled, whatsapp_ordering_menu_url")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (restaurantSettingsError) throw restaurantSettingsError;

    const phoneHash = await hashPhone(sender);
    const { data: savedSession, error: sessionError } = await supabase
      .from("whatsapp_booking_sessions")
      .select("*")
      .eq("phone_hash", phoneHash)
      .maybeSingle();
    if (sessionError) throw sessionError;

    let session = (savedSession as BookingSession | null) || defaultSession(phoneHash);
    console.log("Processing Twilio message", {
      requestId,
      messageSid,
      stage: session.stage,
    });
    if (session.last_message_sid === messageSid) return respond(session.last_reply || undefined);

    const customerPhone = sender.slice("whatsapp:".length);
    const pendingLogs: Promise<unknown>[] = [];
    const logMessage = (record: Record<string, unknown>) => {
      pendingLogs.push(
        supabase.from("whatsapp_messages")
          .insertIgnoringDuplicates({ restaurant_id: restaurantId, customer_phone: customerPhone, ...record }, "message_sid")
          .then(({ error }) => {
            if (error) console.error("Failed to store WhatsApp message", { requestId, error });
          }),
      );
    };
    if (incomingText) {
      logMessage({ direction: "in", sender: "customer", customer_name: customerName, body: incomingText, message_sid: messageSid });
    }
    onReply = (message) => logMessage({ direction: "out", sender: "bot", customer_name: customerName, body: message });
    flushLogs = () => Promise.allSettled(pendingLogs);

    if (
      session.human_until &&
      new Date(session.human_until).getTime() > Date.now() &&
      !/^stop\b/i.test(incomingText)
    ) {
      return respond();
    }

    const normalizedText = incomingText.toLowerCase();
    session.language = detectLanguage(incomingText) || session.language || defaultLanguage;
    const replyText = messages[session.language];
    const orderingMessages: Record<Language, {
      disabled: string;
      prompt: string;
      askName: string;
      continue: (orderText: string) => string;
      added: (orderText: string) => string;
      received: string;
      empty: string;
      tooLong: string;
      cancelled: string;
    }> = {
      en: {
        disabled: "WhatsApp ordering is not enabled. Please contact the restaurant directly.",
        prompt: "Which pizza would you like, and how many? Include any changes, such as no salami or extra mozzarella. You can add or change items in follow-up messages, then send DONE.\n",
        askName: "What name should we put the order under for pickup?",
        continue: (orderText) => `Noted: ${orderText}\nSend any additions or changes, or send DONE when your order is complete.`,
        added: (orderText) => `Current order:\n${orderText}\nSend any additions or changes, or send DONE when your order is complete.`,
        received: "Thanks! Your order request has been sent to the restaurant. The owner will reply here to confirm availability and pickup time.",
        empty: "Please tell me which pizza you would like and how many before sending DONE.",
        tooLong: "That order is too long to process here. Please contact the restaurant directly.",
        cancelled: "Your order request has been cancelled.",
      },
      it: {
        disabled: "Gli ordini WhatsApp non sono attivi. Contatti direttamente il ristorante.",
        prompt: "Quale pizza desidera e in quale quantità? Indichi anche eventuali modifiche, per esempio senza salame o con mozzarella extra. Può aggiungere o modificare i prodotti nei messaggi successivi e poi inviare FINE.\n",
        askName: "A che nome registriamo l'ordine per il ritiro?",
        continue: (orderText) => `Annotato: ${orderText}\nInvii eventuali aggiunte o modifiche, oppure scriva FINE quando l'ordine è completo.`,
        added: (orderText) => `Ordine attuale:\n${orderText}\nInvii eventuali aggiunte o modifiche, oppure scriva FINE quando l'ordine è completo.`,
        received: "Grazie! La richiesta è stata inviata al ristorante. Il proprietario risponderà qui per confermare disponibilità e orario di ritiro.",
        empty: "Indichi la pizza desiderata e la quantità prima di inviare FINE.",
        tooLong: "L'ordine è troppo lungo. Contatti direttamente il ristorante.",
        cancelled: "La richiesta d'ordine è stata annullata.",
      },
      de: {
        disabled: "WhatsApp-Bestellungen sind nicht aktiviert. Bitte wenden Sie sich direkt an das Restaurant.",
        prompt: "Welche Pizza möchtest du und wie viele? Schreib auch Änderungswünsche dazu, zum Beispiel ohne Salami oder mit extra Mozzarella. Du kannst danach noch etwas ergänzen oder ändern. Sende FERTIG, wenn alles stimmt.\n",
        askName: "Auf welchen Namen sollen wir die Bestellung zur Abholung eintragen?",
        continue: (orderText) => `Notiert: ${orderText}\nDu kannst noch etwas ergänzen oder ändern. Sende FERTIG, wenn alles stimmt.`,
        added: (orderText) => `Aktueller Bestellstand:\n${orderText}\nDu kannst noch etwas ergänzen oder ändern. Sende FERTIG, wenn alles stimmt.`,
        received: "Danke! Deine Bestellanfrage wurde an das Restaurant gesendet. Der Besitzer meldet sich hier persönlich, um Verfügbarkeit und Abholzeit zu bestätigen.",
        empty: "Bitte nenne zuerst die gewünschte Pizza und Anzahl, bevor du FERTIG sendest.",
        tooLong: "Die Bestellung ist zu lang. Bitte wende dich direkt an das Restaurant.",
        cancelled: "Deine Bestellanfrage wurde abgebrochen.",
      },
    };
    if (/^stop\b/.test(normalizedText)) {
      const cancellationReply = session.stage === "ordering" || session.stage === "order_name"
        ? orderingMessages[session.language].cancelled
        : replyText.cancelled;
      session = {
        ...defaultSession(phoneHash, session.language),
        last_message_sid: messageSid,
        last_reply: cancellationReply,
      };
      const { error } = await supabase.from("whatsapp_booking_sessions").upsert(session);
      if (error) throw error;
      return respond(cancellationReply);
    }

    const orderIntent = /\b(?:posso|possiamo|vorrei|voglio|volevo|potrei)\b[^.!?]*\bordin\w*|\b(?:can|could|may)\s+(?:i|we)\s+(?:place\s+an\s+)?order\b|\b(?:i|we)\s*(?:'d|would|want|wanna)?\s*(?:like\s+)?(?:to\s+)?order\b|\b(?:kann|k[oö]nnte|darf)\s+(?:ich|man)\b[^.!?]*\bbestell\w*|\b(?:m[oö]chte|will|wollte)\b[^.!?]*\bbestell\w*/i.test(incomingText);
    const orderMatch = /^(?:order|bestellen|bestellung|ordine|ordinare)\b\s*:?\s*([\s\S]*)$/i.exec(incomingText)
      || (orderIntent ? ["", ""] : null);
    if (orderMatch && session.stage !== "ordering") {
      const orderMessages = orderingMessages[session.language];
      let reply = orderMessages.disabled;
      if (restaurantSettings?.whatsapp_ordering_enabled) {
        const orderText = orderMatch[1]
          .replace(/^\s*menu:\s*https?:\/\/\S+\s*/i, "")
          .replace(/^\s*items:\s*/i, "")
          .trim();
        if (orderText.length > 1500) {
          reply = orderMessages.tooLong;
        } else {
          session.stage = "ordering";
          session.whatsapp_order_text = orderText;
          const menuUrl = restaurantSettings.whatsapp_ordering_menu_url || "";
          reply = orderText
            ? orderMessages.continue(orderText)
            : `${orderMessages.prompt}${menuUrl}`;
        }
      }
      session.last_message_sid = messageSid;
      session.last_reply = reply;
      const { error: saveError } = await supabase.from("whatsapp_booking_sessions").upsert(session);
      if (saveError) throw saveError;
      return respond(reply);
    }

    if (session.stage === "order_name") {
      const pickupName = incomingText.trim().slice(0, 100);
      if (!pickupName) {
        session.last_message_sid = messageSid;
        session.last_reply = orderingMessages[session.language].askName;
        const { error } = await supabase.from("whatsapp_booking_sessions").upsert(session);
        if (error) throw error;
        return respond(orderingMessages[session.language].askName);
      }

      const orderText = session.whatsapp_order_text || "";
      const { error } = await supabase.from("whatsapp_orders").upsert({
        message_sid: messageSid,
        restaurant_id: restaurantId,
        customer_phone: sender.slice("whatsapp:".length),
        customer_name: pickupName,
        order_text: orderText,
        status: "new",
      });
      if (error) throw error;
      const received = orderingMessages[session.language].received;
      session = {
        ...defaultSession(phoneHash, session.language),
        last_message_sid: messageSid,
        last_reply: received,
        human_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      const { error: saveError } = await supabase.from("whatsapp_booking_sessions").upsert(session);
      if (saveError) throw saveError;
      return respond(received);
    }

    if (session.stage === "ordering") {
      const orderMessages = orderingMessages[session.language];
      const isFinished = /^(?:fertig|done|abschicken|bestellen|fine|invia|completa)[.! ]*$/i.test(incomingText);
      const currentOrder = session.whatsapp_order_text || "";
      if (isFinished && !currentOrder.trim()) {
        session.last_message_sid = messageSid;
        session.last_reply = orderMessages.empty;
        const { error } = await supabase.from("whatsapp_booking_sessions").upsert(session);
        if (error) throw error;
        return respond(orderMessages.empty);
      }

      if (isFinished) {
        session.stage = "order_name";
        session.last_message_sid = messageSid;
        session.last_reply = orderMessages.askName;
        const { error } = await supabase.from("whatsapp_booking_sessions").upsert(session);
        if (error) throw error;
        return respond(orderMessages.askName);
      }

      const nextOrder = currentOrder
        ? `${currentOrder}\nÄnderung/Ergänzung: ${incomingText}`
        : incomingText;
      if (nextOrder.length > 1500) {
        session.last_message_sid = messageSid;
        session.last_reply = orderMessages.tooLong;
        const { error } = await supabase.from("whatsapp_booking_sessions").upsert(session);
        if (error) throw error;
        return respond(orderMessages.tooLong);
      }
      session.whatsapp_order_text = nextOrder;
      const reply = currentOrder ? orderMessages.added(nextOrder) : orderMessages.continue(incomingText);
      session.last_message_sid = messageSid;
      session.last_reply = reply;
      const { error } = await supabase.from("whatsapp_booking_sessions").upsert(session);
      if (error) throw error;
      return respond(reply);
    }

    if (isCancellationRequest(incomingText)) {
      const now = currentRestaurantDateTime();
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("id, date, start_time, end_time, guests")
        .eq("restaurant_id", restaurantId)
        .eq("phone", sender.slice("whatsapp:".length))
        .eq("status", "confirmed")
        .gte("date", now.date)
        .order("date", { ascending: true });
      if (error) throw error;

      const upcomingBookings = ((bookings || []) as CancellationOption[])
        .filter((booking) => booking.date > now.date || formatTime(booking.start_time) > now.time)
        .sort((left, right) =>
          left.date.localeCompare(right.date) || left.start_time.localeCompare(right.start_time)
        );

      if (upcomingBookings.length === 0) {
        session = { ...defaultSession(phoneHash, session.language), last_message_sid: messageSid };
        session.last_reply = replyText.noUpcomingBooking;
        const { error: saveError } = await supabase.from("whatsapp_booking_sessions").upsert(session);
        if (saveError) throw saveError;
        return respond(replyText.noUpcomingBooking);
      }

      if (upcomingBookings.length === 1) {
        session = {
          ...defaultSession(phoneHash, session.language),
          stage: "cancellation_confirm",
          cancellation_booking_id: upcomingBookings[0].id,
          cancellation_options: [upcomingBookings[0]],
        };
        const reply = replyText.confirmCancellation(upcomingBookings[0]);
        session.last_message_sid = messageSid;
        session.last_reply = reply;
        const { error: saveError } = await supabase.from("whatsapp_booking_sessions").upsert(session);
        if (saveError) throw saveError;
        return respond(reply);
      }

      session = {
        ...defaultSession(phoneHash, session.language),
        stage: "cancellation_select",
        cancellation_options: upcomingBookings,
      };
      const options = upcomingBookings
        .map((booking, index) =>
          `${index + 1}) ${formatDate(booking.date)} ${formatTime(booking.start_time)} (${booking.guests})`
        )
        .join("\n");
      const reply = `${replyText.chooseCancellation}\n${options}`;
      session.last_message_sid = messageSid;
      session.last_reply = reply;
      const { error: saveError } = await supabase.from("whatsapp_booking_sessions").upsert(session);
      if (saveError) throw saveError;
      return respond(reply);
    }

    if (isThankYou(incomingText)) {
      session.last_message_sid = messageSid;
      session.last_reply = replyText.thanks;
      const { error } = await supabase.from("whatsapp_booking_sessions").upsert(session);
      if (error) throw error;
      return respond(replyText.thanks);
    }

    const details = parseBookingDetails(incomingText);
    if (
      session.stage !== "cancellation_select" &&
      session.stage !== "cancellation_confirm" &&
      session.stage !== "main_menu" &&
      (details.guests || details.booking_date || details.start_time || details.customer_name)
    ) {
      const dateChanged = Boolean(details.booking_date && details.booking_date !== session.booking_date);
      session = {
        ...session,
        guests: details.guests ?? session.guests,
        booking_date: details.booking_date ?? session.booking_date,
        customer_name: details.customer_name ?? session.customer_name,
        start_time: dateChanged ? details.start_time || null : details.start_time || session.start_time,
        end_time: dateChanged || details.start_time ? null : session.end_time,
      };
      if (!session.guests) session.stage = "party_size";
      else if (!session.booking_date) session.stage = "date";
      else if (!session.start_time) session.stage = "time";
      else session.stage = "time";
    }

    let reply: string;
    switch (session.stage) {
      case "main_menu": {
        if (/^(?:1|reservieren|tisch reservieren|prenotare|tavolo)$/i.test(normalizedText)) {
          session.stage = "party_size";
          reply = replyText.askGuests;
          break;
        }
        if (/^(?:2|pizza|pizza bestellen|bestellen|bestellung|ordinare|pizza order)$/i.test(normalizedText)) {
          if (!restaurantSettings?.whatsapp_ordering_enabled) {
            reply = orderingMessages[session.language].disabled;
            break;
          }
          session.stage = "ordering";
          session.whatsapp_order_text = "";
          const menuUrl = restaurantSettings.whatsapp_ordering_menu_url || "";
          reply = `${orderingMessages[session.language].prompt}${menuUrl}`;
          break;
        }
        reply = replyText.invalidService;
        break;
      }
      case "cancellation_select": {
        const selection = /^\s*(\d+)\s*$/.exec(incomingText);
        const option = selection
          ? session.cancellation_options[Number(selection[1]) - 1]
          : undefined;
        if (!option) {
          const options = session.cancellation_options
            .map((booking, index) =>
              `${index + 1}) ${formatDate(booking.date)} ${formatTime(booking.start_time)} (${booking.guests})`
            )
            .join("\n");
          reply = `${replyText.invalidCancellationChoice}\n${options}`;
          break;
        }

        session = {
          ...session,
          stage: "cancellation_confirm",
          cancellation_booking_id: option.id,
          cancellation_options: [option],
        };
        reply = replyText.confirmCancellation(option);
        break;
      }
      case "cancellation_confirm": {
        if (isNegative(incomingText)) {
          session = { ...defaultSession(phoneHash, session.language) };
          reply = replyText.cancellationKept;
          break;
        }
        if (!isAffirmative(incomingText)) {
          const { data: selectedBooking, error } = await supabase
            .from("bookings")
            .select("id, date, start_time, end_time, guests")
            .eq("restaurant_id", restaurantId)
            .eq("id", session.cancellation_booking_id || "")
            .eq("phone", sender.slice("whatsapp:".length))
            .eq("status", "confirmed")
            .maybeSingle();
          if (error) throw error;
          if (selectedBooking) {
            const option = selectedBooking as CancellationOption;
            session.cancellation_options = [option];
            reply = replyText.confirmCancellation(option);
          } else {
            reply = replyText.cancellationExpired;
          }
          if (!selectedBooking) session = { ...defaultSession(phoneHash, session.language) };
          break;
        }

        const confirmedOption = session.cancellation_options[0];
        if (!confirmedOption) {
          session = { ...defaultSession(phoneHash, session.language) };
          reply = replyText.cancellationExpired;
          break;
        }
        const { data: cancelledBooking, error } = await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("restaurant_id", restaurantId)
          .eq("id", session.cancellation_booking_id || "")
          .eq("phone", sender.slice("whatsapp:".length))
          .eq("status", "confirmed")
          .eq("date", confirmedOption.date)
          .eq("start_time", confirmedOption.start_time)
          .eq("end_time", confirmedOption.end_time)
          .eq("guests", confirmedOption.guests)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        session = { ...defaultSession(phoneHash, session.language) };
        reply = cancelledBooking ? replyText.cancellationComplete : replyText.cancellationExpired;
        break;
      }
      case "idle": {
        session = { ...defaultSession(phoneHash, session.language), stage: "main_menu" };
        reply = replyText.welcome;
        break;
      }
      case "party_size": {
        const guests = parseGuests(incomingText) ?? parseStandaloneGuests(incomingText);
        if (guests == null || !Number.isSafeInteger(guests) || guests < 1 || guests > 2147483647) {
          reply = replyText.invalidGuests;
          break;
        }
        session = { ...session, stage: "date", guests };
        reply = replyText.askDate;
        break;
      }
      case "date": {
        const date = parseRequestedDate(incomingText);
        if (!date) {
          reply = replyText.invalidDate;
          break;
        }
        session = { ...session, stage: "time", booking_date: date };
        reply = replyText.askTime;
        break;
      }
      case "time": {
        const startTime = session.start_time || parseRequestedTime(incomingText) || parseStandaloneHour(incomingText);
        if (!startTime) {
          reply = replyText.askTime;
          break;
        }
        const now = currentRestaurantDateTime();
        if (session.booking_date === now.date && startTime <= now.time) {
          reply = replyText.pastTime;
          break;
        }
        const endTime = addDuration(startTime);
        if (!endTime) {
          reply = replyText.durationLimit;
          break;
        }
        session = { ...session, start_time: startTime, end_time: endTime };

        const { data: tables, error: tablesError } = await supabase
          .from("tables")
          .select("id, table_number, seats")
          .eq("restaurant_id", restaurantId)
          .gte("seats", session.guests!)
          .order("seats", { ascending: true });
        if (tablesError) throw tablesError;
        if (!tables?.length) {
          session = { ...session, start_time: null, end_time: null, stage: "time" };
          reply = replyText.noCapacity;
          break;
        }

        const { data: bookings, error: bookingsError } = await supabase
          .from("bookings")
          .select("table_id")
          .eq("restaurant_id", restaurantId)
          .eq("date", session.booking_date!)
          .lt("start_time", endTime)
          .gt("end_time", startTime);
        if (bookingsError) throw bookingsError;

        const busyTableIds = new Set((bookings || []).map((booking: { table_id: string | number }) => String(booking.table_id)));
        const available = tables.find((table: { id: string | number }) => !busyTableIds.has(String(table.id)));
        if (!available) {
          session = { ...session, start_time: null, end_time: null, stage: "time" };
          reply = replyText.unavailable;
          break;
        }

        session = { ...session, stage: "customer_name", start_time: startTime, end_time: endTime };
        if (session.customer_name) {
          const { data: booking, error: bookingError } = await supabase.rpc("create_whatsapp_booking", {
            p_restaurant_id: restaurantId,
            p_guests: session.guests,
            p_booking_date: session.booking_date,
            p_start_time: session.start_time,
            p_end_time: session.end_time,
            p_customer_name: session.customer_name,
            p_phone: sender.slice("whatsapp:".length),
            p_message_sid: messageSid,
          });
          if (bookingError) throw bookingError;
          if (!booking?.available) {
            session = { ...session, stage: "time", start_time: null, end_time: null };
            reply = replyText.notAvailableNow;
            break;
          }
          const confirmation = replyText.booked(
            session.customer_name,
            String(booking.table_number),
            formatDate(session.booking_date!),
            formatTime(session.start_time!),
            formatTime(session.end_time!),
          );
          session = {
            ...defaultSession(phoneHash, session.language),
            last_message_sid: messageSid,
            last_reply: replyText.bookingConfirmed,
          };
          const { error: saveError } = await supabase.from("whatsapp_booking_sessions").upsert(session);
          if (saveError) throw saveError;
          return respond(confirmation);
        }
        reply = replyText.available(session.guests!, formatDate(session.booking_date!), formatTime(startTime));
        break;
      }
      case "customer_name": {
        const name = session.customer_name || incomingText.trim();
        if (!name || name.length > 100) {
          reply = replyText.invalidName;
          break;
        }

        const { data: booking, error: bookingError } = await supabase.rpc("create_whatsapp_booking", {
          p_restaurant_id: restaurantId,
          p_guests: session.guests,
          p_booking_date: session.booking_date,
          p_start_time: session.start_time,
          p_end_time: session.end_time,
          p_customer_name: name,
          p_phone: sender.slice("whatsapp:".length),
          p_message_sid: messageSid,
        });
        if (bookingError?.code === "23P01") {
          session = { ...session, stage: "time", start_time: null, end_time: null };
          reply = replyText.notAvailableNow;
          break;
        }
        if (bookingError) throw bookingError;

        if (!booking?.available) {
          session = { ...session, stage: "time", start_time: null, end_time: null };
          reply = replyText.notAvailableNow;
          break;
        }

        const confirmation = replyText.booked(
          name,
          String(booking.table_number),
          formatDate(session.booking_date!),
          formatTime(session.start_time!),
          formatTime(session.end_time!),
        );
        const { error: clearError } = await supabase.from("whatsapp_booking_sessions").upsert({
          ...defaultSession(phoneHash, session.language),
          last_message_sid: messageSid,
          last_reply: replyText.bookingConfirmed,
        });
        if (clearError) throw clearError;

        return respond(confirmation);
      }
    }

    session.last_message_sid = messageSid;
    session.last_reply = reply;
    const { error: saveError } = await supabase.from("whatsapp_booking_sessions").upsert(session);
    if (saveError) throw saveError;
    return respond(reply);
  } catch (error) {
    console.error("WhatsApp booking webhook failed", { requestId, error });
    return respond(defaultText.retry, 500);
  }
});
