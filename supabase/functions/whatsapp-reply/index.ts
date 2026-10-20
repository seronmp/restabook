const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function hashPhone(phone: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phone));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pickupReadyAtFromReply(text: string): string | null {
  const delay = /\b(?:in|tra)\s+(\d{1,3})\s*(?:min(?:ute(?:s)?|uten|uti)?|mins?)\b/i.exec(text);
  if (delay) {
    const minutes = Number(delay[1]);
    if (Number.isInteger(minutes) && minutes > 0 && minutes <= 240) {
      return new Date(Date.now() + minutes * 60_000).toISOString();
    }
  }

  if (/\b(?:abholbereit|ready\s+(?:for\s+pickup|to\s+pick\s+up)|pront[oa]\s+(?:da\s+ritirare|per\s+il\s+ritiro))\b/i.test(text)) {
    return new Date().toISOString();
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
    const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
    const fromNumber = requiredEnv("TWILIO_WHATSAPP_FROM");
    if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) {
      return json({
        error: `TWILIO_ACCOUNT_SID ist ungültig (Länge ${accountSid.length}, beginnt mit "${accountSid.slice(0, 2)}"). Erwartet: AC + 32 Zeichen.`,
      }, 500);
    }
    if (!/^[0-9a-zA-Z]{32}$/.test(authToken)) {
      return json({ error: `TWILIO_AUTH_TOKEN ist ungültig (Länge ${authToken.length}). Erwartet: 32 Buchstaben/Ziffern.` }, 500);
    }
    const service = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

    const authorization = req.headers.get("Authorization") || "";
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceRoleKey, Authorization: authorization },
    });
    if (!authorization || !userResponse.ok) return json({ error: "Not signed in" }, 401);
    const user = await userResponse.json();

    const { phone, body, restaurantId } = await req.json();
    const text = typeof body === "string" ? body.trim() : "";
    if (
      !/^\+\d{7,15}$/.test(String(phone)) ||
      typeof restaurantId !== "string" ||
      !restaurantId.trim() ||
      !text ||
      text.length > 1500
    ) {
      return json({ error: "Invalid restaurant, phone number, or message" }, 400);
    }

    const conversationParams = new URLSearchParams({
      restaurant_id: `eq.${restaurantId}`,
      customer_phone: `eq.${phone}`,
      direction: "eq.in",
      select: "restaurant_id",
      order: "created_at.desc",
      limit: "1",
    });
    const known = await fetch(
      `${supabaseUrl}/rest/v1/whatsapp_messages?${conversationParams}`,
      { headers: service },
    );
    if (!known.ok) {
      console.error("Conversation lookup failed", { status: known.status, detail: await known.text() });
      return json({ error: `Konversation konnte nicht geladen werden (Status ${known.status}).` }, 500);
    }
    const knownRows = await known.json();
    if (!knownRows.length || String(knownRows[0].restaurant_id) !== restaurantId) {
      return json({ error: "No conversation with this number" }, 404);
    }

    if (user.email !== "admin@admin.com") {
      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=restaurant_id`,
        { headers: service },
      );
      const profiles = profileResponse.ok ? await profileResponse.json() : [];
      if (String(profiles[0]?.restaurant_id) !== restaurantId) {
        console.error("Reply not allowed", { profileStatus: profileResponse.status, hasProfile: Boolean(profiles[0]) });
        return json({ error: "Not allowed" }, 403);
      }
    }

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: `whatsapp:${phone}`, From: fromNumber, Body: text }),
      },
    );
    const twilioResult = await twilioResponse.json().catch(() => ({}));
    if (!twilioResponse.ok) {
      console.error("Twilio send failed", {
        status: twilioResponse.status,
        code: twilioResult.code,
        message: twilioResult.message,
      });
      return json({
        error: twilioResult.code === 63016
          ? "Das 24-Stunden-Fenster ist abgelaufen. Der Kunde muss zuerst wieder schreiben."
          : `Nachricht konnte nicht gesendet werden (Twilio ${twilioResult.code ?? twilioResponse.status}): ${twilioResult.message ?? "keine Details"}`,
        code: twilioResult.code ?? null,
      }, 502);
    }

    await fetch(`${supabaseUrl}/rest/v1/whatsapp_messages`, {
      method: "POST",
      headers: { ...service, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        customer_phone: phone,
        direction: "out",
        sender: "staff",
        body: text,
        message_sid: twilioResult.sid || null,
        sent_by: user.email || null,
        read_at: new Date().toISOString(),
      }),
    });

    const readyAt = pickupReadyAtFromReply(text);
    if (readyAt) {
      const ordersResponse = await fetch(
        `${supabaseUrl}/rest/v1/whatsapp_orders?restaurant_id=eq.${encodeURIComponent(restaurantId)}&customer_phone=eq.${encodeURIComponent(phone)}&picked_up_at=is.null&status=neq.rejected&select=message_sid&order=created_at.desc&limit=1`,
        { headers: service },
      );
      if (!ordersResponse.ok) {
        console.error("Pickup order lookup failed", { status: ordersResponse.status, detail: await ordersResponse.text() });
      } else {
        const [latestOrder] = await ordersResponse.json();
        if (latestOrder?.message_sid) {
          const pickupUpdate = await fetch(
            `${supabaseUrl}/rest/v1/whatsapp_orders?message_sid=eq.${encodeURIComponent(latestOrder.message_sid)}&picked_up_at=is.null`,
            {
              method: "PATCH",
              headers: { ...service, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ ready_at: readyAt }),
            },
          );
          if (!pickupUpdate.ok) {
            console.error("Pickup time update failed", { status: pickupUpdate.status, detail: await pickupUpdate.text() });
          }
        }
      }
    }

    // Keep the bot quiet while staff are in the conversation.
    const phoneHash = await hashPhone(`whatsapp:${phone}`);
    await fetch(`${supabaseUrl}/rest/v1/whatsapp_booking_sessions?phone_hash=eq.${phoneHash}`, {
      method: "PATCH",
      headers: { ...service, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ human_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }),
    });

    return json({ ok: true });
  } catch (error) {
    console.error("WhatsApp reply failed", error);
    return json({ error: `Server error: ${error instanceof Error ? error.message : String(error)}` }, 500);
  }
});
