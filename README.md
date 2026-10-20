# Restabook WhatsApp booking

The `whatsapp-webhook` Supabase Edge Function handles inbound WhatsApp messages sent through Twilio. It recognizes booking details in one message or collects missing details in follow-up messages, checks the configured restaurant's tables, and creates the booking only after atomically checking availability again. Reservations are two hours long.

## Setup

1. Link the Supabase CLI to the Restabook project and apply the migration:

   ```sh
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   The migration expects the existing `public.tables` and `public.bookings` columns used by Restabook (`id`, `restaurant_id`, `table_number`, `seats`, `table_id`, `date`, `start_time`, `end_time`, `name`, `guests`, and `phone`).

2. In Twilio, enable WhatsApp for your number (or the Twilio WhatsApp Sandbox while testing). Configure its inbound message webhook to:

   ```text
   https://<your-project-ref>.supabase.co/functions/v1/whatsapp-webhook
   ```

   Set the webhook method to **HTTP POST**.

3. Configure the Edge Function secrets. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; set the remaining values:

   ```sh
   supabase secrets set \
     RESTAURANT_ID='<the restaurant_id from public.restaurants>' \
     TWILIO_ACCOUNT_SID='<Twilio Account SID>' \
     TWILIO_AUTH_TOKEN='<Twilio Auth Token>' \
     TWILIO_WHATSAPP_FROM='whatsapp:+<your Twilio WhatsApp number>' \
     TWILIO_WEBHOOK_URL='https://<your-project-ref>.supabase.co/functions/v1/whatsapp-webhook' \
     RESTAURANT_TIMEZONE='Europe/Rome' \
     WHATSAPP_LANGUAGE='it'
   ```

   `WHATSAPP_LANGUAGE` is the fallback language for short or ambiguous replies; it may be `it`, `en`, or `de`. The bot detects Italian, English, and German wording (including common South Tyrolean German expressions) and remembers the detected language during the booking. It parses numeric dates, today/tomorrow, and weekday names, plus 24-hour times. `RESTAURANT_TIMEZONE` is used to resolve relative dates and reject past times.

4. Deploy the public Twilio webhook without Supabase JWT verification. The function independently validates Twilio's `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN` and the exact configured webhook URL:

   ```sh
   supabase functions deploy whatsapp-webhook --no-verify-jwt
   ```

5. Deploy the authenticated reply function for staff responses from the app inbox. It uses the same configured Edge Function secrets; keep JWT verification enabled:

   ```sh
   supabase functions deploy whatsapp-reply
   ```

For Sandbox testing, join the Twilio Sandbox from the customer WhatsApp account before sending a booking request. A customer can send a full request such as "für heute 17:00 4 Personen" or provide the details one at a time. If a name is not included, the bot asks for it after checking availability. Dates can be `YYYY-MM-DD`, `DD/MM/YYYY`, today/tomorrow, or a weekday; times use 24-hour `HH:MM`. Send `cancel` to find upcoming reservations made with that WhatsApp number; the bot asks which reservation to cancel if there is more than one and always asks for confirmation before cancelling. Send `stop` to abandon an unfinished booking request. The language support uses local phrase and date/time patterns, not open-ended AI translation, so unclear or unrecognized dialect phrases may still need to be answered in the bot's prompts.

The session table stores a hash of the sender number rather than the number itself. The reservation phone number is stored in `public.bookings` as it is for bookings made in Restabook. The booking RPC is restricted to `service_role`; a database trigger prevents overlapping bookings for the same table and date, including bookings created in the dashboard.

## WhatsApp orders and staff inbox

The later migrations add menu-based pickup orders, a staff inbox with read/unread state, and restaurant-specific quick replies. Apply all migrations with `supabase db push`, then deploy both Edge Functions as described above. In the dashboard, open **Bestellungen** for a restaurant, enable ordering, and enter its menu URL and WhatsApp number. Customers can start an order from the `ORDER` link, add or change items in follow-up messages, and send `FERTIG` (or the localized equivalent) to submit it with a pickup name.

Staff can reply from the WhatsApp inbox. Replies pause the bot for that customer for 24 hours; quick replies such as “in 10 Minuten abholbereit” set the pickup countdown shown with the order. Mark an order as picked up to close it. The inbox and orders are scoped to each restaurant, including in the global administrator view.
