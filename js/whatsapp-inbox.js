import { state } from './config.js';

let selectedConversationKey = null;
let refreshTimeout;
let quickReplyDraft = [];

const defaultQuickReplies = [
    'Deine Pizza ist in 10 Minuten abholbereit.',
    'Deine Pizza ist jetzt abholbereit.'
];

const el = id => document.getElementById(id);

function formatTime(value) {
    const date = new Date(value);
    const sameDay = date.toDateString() === new Date().toDateString();
    return sameDay
        ? date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' +
            date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function conversations() {
    const byKey = new Map();
    (state.whatsappMessages || []).forEach(message => {
        const key = `${message.restaurant_id}:${message.customer_phone}`;
        const entry = byKey.get(key) || {
            key,
            phone: message.customer_phone,
            restaurantId: message.restaurant_id,
            restaurantName: (state.allRestaurants || []).find(
                restaurant => restaurant.restaurant_id === message.restaurant_id
            )?.name || '',
            customerName: '',
            messages: [],
            unread: 0
        };
        entry.messages.push(message);
        if (message.customer_name) entry.customerName = message.customer_name;
        if (message.direction === 'in' && !message.read_at) entry.unread += 1;
        byKey.set(key, entry);
    });
    return [...byKey.values()].sort((a, b) =>
        b.messages[b.messages.length - 1].created_at.localeCompare(a.messages[a.messages.length - 1].created_at)
    );
}

function restaurantQuickReplies() {
    const restaurant = (state.allRestaurants || []).find(
        item => item.restaurant_id === state.currentRestaurantId
    );
    const replies = restaurant?.whatsapp_quick_replies;
    return Array.isArray(replies)
        ? replies.filter(reply => typeof reply === 'string' && reply.trim()).slice(0, 8)
        : defaultQuickReplies;
}

function renderQuickReplies() {
    const list = el('whatsapp-quick-replies-list');
    if (!list) return;
    list.replaceChildren();
    restaurantQuickReplies().forEach(replyText => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100';
        button.textContent = replyText.length > 56 ? `${replyText.slice(0, 53)}…` : replyText;
        button.title = replyText;
        button.addEventListener('click', () => {
            const input = el('whatsapp-reply-input');
            input.value = replyText;
            input.focus();
        });
        list.append(button);
    });
    el('whatsapp-quick-replies-manage')?.classList.toggle('hidden', state.currentRestaurantId === 'tutti');
}

function renderQuickReplyEditor() {
    const list = el('quick-replies-editor-list');
    list.replaceChildren();
    quickReplyDraft.forEach((reply, index) => {
        const row = document.createElement('div');
        row.className = 'flex items-start gap-2';
        const input = document.createElement('textarea');
        input.className = 'min-h-20 flex-1 resize-y rounded-md border border-gray-300 p-2 text-sm';
        input.maxLength = 500;
        input.value = reply;
        input.placeholder = 'Antworttext';
        input.setAttribute('aria-label', `Schnellantwort ${index + 1}`);
        input.addEventListener('input', () => { quickReplyDraft[index] = input.value; });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'rounded-md border border-gray-300 p-2 text-gray-600 hover:border-rose-400 hover:text-rose-700';
        remove.setAttribute('aria-label', `Schnellantwort ${index + 1} löschen`);
        remove.title = 'Antwort löschen';
        remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
        remove.addEventListener('click', () => {
            quickReplyDraft.splice(index, 1);
            renderQuickReplyEditor();
        });
        row.append(input, remove);
        list.append(row);
    });
}

function openQuickRepliesEditor() {
    if (!state.currentRestaurantId || state.currentRestaurantId === 'tutti') return;
    quickReplyDraft = [...restaurantQuickReplies()];
    renderQuickReplyEditor();
    el('quick-replies-error').classList.add('hidden');
    el('quick-replies-modal').classList.remove('hidden');
    el('quick-replies-modal').classList.add('flex');
}

async function saveQuickReplies(event) {
    event.preventDefault();
    const error = el('quick-replies-error');
    const replies = quickReplyDraft.map(reply => reply.trim()).filter(Boolean);
    if (replies.length > 8 || replies.some(reply => reply.length > 500)) {
        error.textContent = 'Speichere höchstens 8 Antworten mit maximal 500 Zeichen.';
        error.classList.remove('hidden');
        return;
    }
    const { data, error: saveError } = await state.supabaseClient
        .from('restaurants')
        .update({ whatsapp_quick_replies: replies })
        .eq('restaurant_id', state.currentRestaurantId)
        .select('restaurant_id');
    if (saveError) {
        error.textContent = `Speichern fehlgeschlagen: ${saveError.message}`;
        error.classList.remove('hidden');
        return;
    }
    if (!data?.length) {
        error.textContent = 'Keine Restaurantzeile aktualisiert. Prüfe Restaurant-Zuordnung und Supabase-Berechtigungen.';
        error.classList.remove('hidden');
        return;
    }
    const restaurant = (state.allRestaurants || []).find(
        item => item.restaurant_id === state.currentRestaurantId
    );
    if (restaurant) restaurant.whatsapp_quick_replies = replies;
    renderQuickReplies();
    el('quick-replies-modal').classList.add('hidden');
    el('quick-replies-modal').classList.remove('flex');
}

export async function loadWhatsappMessages() {
    if (!state.supabaseClient) return;
    let query = state.supabaseClient
        .from('whatsapp_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
    if (state.currentRestaurantId && state.currentRestaurantId !== 'tutti') {
        query = query.eq('restaurant_id', state.currentRestaurantId);
    }
    const { data, error } = await query;
    if (error) {
        console.error('WhatsApp-Nachrichten konnten nicht geladen werden:', error.message);
        return;
    }
    state.whatsappMessages = (data || []).reverse();
    renderWhatsappInbox();
}

async function markRead(conversation) {
    const unread = (state.whatsappMessages || []).filter(
        message => message.restaurant_id === conversation.restaurantId &&
            message.customer_phone === conversation.phone &&
            message.direction === 'in' &&
            !message.read_at
    );
    if (unread.length === 0) return;
    const now = new Date().toISOString();
    unread.forEach(message => { message.read_at = now; });
    renderWhatsappInbox();
    const { error } = await state.supabaseClient
        .from('whatsapp_messages')
        .update({ read_at: now })
        .eq('restaurant_id', conversation.restaurantId)
        .eq('customer_phone', conversation.phone)
        .eq('direction', 'in')
        .is('read_at', null);
    if (error) {
        console.error('WhatsApp-Nachrichten konnten nicht als gelesen markiert werden:', error.message);
        await loadWhatsappMessages();
    }
}

export function renderWhatsappInbox() {
    const section = el('whatsapp-inbox-section');
    if (!section) return;
    const list = conversations();
    const hasOrdering = (state.allRestaurants || []).some(restaurant =>
        restaurant.whatsapp_ordering_enabled &&
        (state.currentRestaurantId === 'tutti' || restaurant.restaurant_id === state.currentRestaurantId)
    );
    section.classList.toggle('hidden', list.length === 0 && !hasOrdering);

    const totalUnread = list.reduce((sum, conversation) => sum + conversation.unread, 0);
    const badge = el('whatsapp-inbox-unread');
    badge.textContent = `${totalUnread} neu`;
    badge.classList.toggle('hidden', totalUnread === 0);
    document.title = document.title.replace(/^\(\d+\)\s*/, '');
    if (totalUnread > 0) document.title = `(${totalUnread}) ${document.title}`;

    const container = el('whatsapp-conversations');
    container.replaceChildren();
    if (list.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'p-4 text-sm text-gray-500';
        empty.textContent = 'Noch keine Nachrichten.';
        container.append(empty);
    }
    list.forEach(conversation => {
        const last = conversation.messages[conversation.messages.length - 1];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'w-full text-left px-4 py-3 hover:bg-emerald-50 ' +
            (conversation.key === selectedConversationKey ? 'bg-emerald-50' : 'bg-white');
        const top = document.createElement('div');
        top.className = 'flex items-center justify-between gap-2';
        const identity = document.createElement('div');
        const name = document.createElement('span');
        name.className = 'block text-sm font-semibold text-gray-800';
        name.textContent = conversation.customerName || conversation.phone;
        identity.append(name);
        if (conversation.customerName) {
            const phone = document.createElement('span');
            phone.className = 'block text-xs text-gray-500';
            phone.textContent = conversation.phone;
            identity.append(phone);
        }
        if (state.currentRestaurantId === 'tutti' && conversation.restaurantName) {
            const restaurant = document.createElement('span');
            restaurant.className = 'block text-xs text-emerald-700';
            restaurant.textContent = conversation.restaurantName;
            identity.append(restaurant);
        }
        const meta = document.createElement('span');
        meta.className = 'text-xs text-gray-500 shrink-0';
        meta.textContent = formatTime(last.created_at);
        top.append(identity, meta);
        const preview = document.createElement('div');
        preview.className = 'flex items-center justify-between gap-2 mt-1';
        const text = document.createElement('span');
        text.className = 'text-xs text-gray-600 truncate';
        text.textContent = last.body;
        preview.append(text);
        if (conversation.unread > 0) {
            const dot = document.createElement('span');
            dot.className = 'text-xs font-semibold text-white bg-rose-600 rounded-full px-2 py-0.5 shrink-0';
            dot.textContent = String(conversation.unread);
            preview.append(dot);
        }
        button.append(top, preview);
        button.addEventListener('click', () => {
            selectedConversationKey = conversation.key;
            renderWhatsappInbox();
            markRead(conversation);
        });
        container.append(button);
    });

    renderChat(list.find(conversation => conversation.key === selectedConversationKey));
}

function renderChat(conversation) {
    const box = el('whatsapp-chat-messages');
    const form = el('whatsapp-reply-form');
    const quickReplies = el('whatsapp-quick-replies');
    box.replaceChildren();
    form.classList.toggle('hidden', !conversation);
    quickReplies?.classList.toggle('hidden', !conversation);
    el('whatsapp-chat-title').textContent = conversation
        ? `${conversation.customerName ? `${conversation.customerName} · ` : ''}${conversation.phone}` +
            (state.currentRestaurantId === 'tutti' && conversation.restaurantName ? ` · ${conversation.restaurantName}` : '')
        : 'Chat auswählen';
    if (!conversation) return;
    renderQuickReplies();

    conversation.messages.forEach(message => {
        const outgoing = message.direction === 'out';
        const row = document.createElement('div');
        row.className = 'flex ' + (outgoing ? 'justify-end' : 'justify-start');
        const bubble = document.createElement('div');
        const color = message.sender === 'staff'
            ? 'bg-emerald-600 text-white'
            : message.sender === 'bot' ? 'bg-slate-200 text-gray-800' : 'bg-white text-gray-800 border border-gray-200';
        bubble.className = `max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${color}`;
        const body = document.createElement('div');
        body.textContent = message.body;
        const meta = document.createElement('div');
        meta.className = 'mt-1 text-[10px] opacity-70';
        const who = message.sender === 'staff' ? (message.sent_by || 'Team') : message.sender === 'bot' ? 'Bot' : 'Kunde';
        meta.textContent = `${who} · ${formatTime(message.created_at)}`;
        bubble.append(body, meta);
        row.append(bubble);
        box.append(row);
    });
    box.scrollTop = box.scrollHeight;
}

async function sendReply(event) {
    event.preventDefault();
    const input = el('whatsapp-reply-input');
    const button = el('whatsapp-reply-send');
    const error = el('whatsapp-reply-error');
    const body = input.value.trim();
    const conversation = conversations().find(item => item.key === selectedConversationKey);
    if (!conversation || !body) return;

    error.classList.add('hidden');
    button.disabled = true;
    try {
        const { data, error: invokeError } = await state.supabaseClient.functions.invoke('whatsapp-reply', {
            body: { phone: conversation.phone, restaurantId: conversation.restaurantId, body }
        });
        if (invokeError || data?.error) {
            let message = data?.error;
            if (!message && invokeError?.context?.json) {
                message = (await invokeError.context.json().catch(() => null))?.error;
            }
            throw new Error(message || 'Nachricht konnte nicht gesendet werden.');
        }
        input.value = '';
        await loadWhatsappMessages();
    } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err);
        error.classList.remove('hidden');
    } finally {
        button.disabled = false;
    }
}

export function setupWhatsappInbox() {
    el('whatsapp-reply-form')?.addEventListener('submit', sendReply);
    el('whatsapp-quick-replies-manage')?.addEventListener('click', openQuickRepliesEditor);
    el('quick-replies-add')?.addEventListener('click', () => {
        if (quickReplyDraft.length >= 8) return;
        quickReplyDraft.push('');
        renderQuickReplyEditor();
        el('quick-replies-editor-list').lastElementChild?.querySelector('textarea')?.focus();
    });
    el('quick-replies-form')?.addEventListener('submit', saveQuickReplies);
    el('close-quick-replies')?.addEventListener('click', () => {
        el('quick-replies-modal').classList.add('hidden');
        el('quick-replies-modal').classList.remove('flex');
    });
    if (!state.supabaseClient) return;
    state.supabaseClient
        .channel('whatsapp-message-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, () => {
            clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(loadWhatsappMessages, 200);
        })
        .subscribe();
}
