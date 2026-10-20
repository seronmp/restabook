import { state, translations } from './config.js';
import { initAuth } from './auth.js';
import { renderCalendar, renderDailySummary, formatDateKey } from './calendar.js';
import { renderRooms, renderTables } from './floor.js';
import { loadWhatsappMessages, setupWhatsappInbox } from './whatsapp-inbox.js';

let whatsappOrderCountdownTimer;

// ==========================================
// FIX: FUNZIONE GLOBALE DI CONTENIMENTO (TABLET VS PC)
// ==========================================
window.fermaEntroIConfini = function(x, y, maxWidth = 1000, maxHeight = 800, elWidth = 50, elHeight = 50) {
    return {
        x: Math.max(0, Math.min(x, maxWidth - elWidth)),
        y: Math.max(0, Math.min(y, maxHeight - elHeight))
    };
};

document.addEventListener('DOMContentLoaded', () => {
    initAuth(async () => {
        await initRestaurantSelector(); // Carica prima la lista
        await loadData();               // Poi disegna lo schermo
        setupEventListeners();
        setupBookingUpdates();
        setupWhatsappInbox();
        setupGlobalHeaderButtons();
    });
});

async function loadData() {
    if (!state.supabaseClient) {
        console.warn("Client Supabase non ancora inizializzato.");
        return;
    }
    
    const restId = state.currentRestaurantId || localStorage.getItem('currentRestaurantId');
    if (!restId || restId === 'undefined') return;

    state.rooms = [];
    state.currentRoomId = null;

    try {
        // 1. CARICAMENTO SALE E MURI
        if (restId !== 'tutti') {
            const { data, error } = await state.supabaseClient
                .from('restaurants')
                .select('rooms_config')
                .eq('restaurant_id', restId)
                .single();
                
            if (error && error.code !== 'PGRST116') {
                console.error("Errore (rooms_config):", error.message);
            } else if (data && data.rooms_config && data.rooms_config.length > 0) {
                state.rooms = typeof data.rooms_config === 'string' ? JSON.parse(data.rooms_config) : data.rooms_config;
            } else {
                const savedRooms = localStorage.getItem('restabook_rooms_' + restId) || localStorage.getItem('rooms_' + restId);
                if (savedRooms) {
                    try { state.rooms = JSON.parse(savedRooms); } catch (e) {}
                }
            }
        }

        // Conversione vecchi muri e sanificazione coordinate (Tablet/PC fix)
        if (restId === 'tutti') {
            state.rooms = [{ id: 'sala-globale', name: 'Vista Globale', walls: [] }];
        } else if (state.rooms && state.rooms.length > 0) {
            if (state.rooms[0].x1 !== undefined || !state.rooms[0].id) {
                state.rooms = [{
                    id: 'sala-principale',
                    name: 'Sala Principale',
                    walls: [...state.rooms]
                }];
                if (typeof window.saveRoomsToLocal === 'function') setTimeout(() => window.saveRoomsToLocal(), 500);
            }
            
            // Assicura che i muri non escano dallo schermo
            state.rooms.forEach(r => {
                if (!r.walls) r.walls = [];
                r.walls = r.walls.map(w => ({
                    ...w,
                    x1: Math.max(0, Math.min(w.x1 ?? 50, 1000)),
                    y1: Math.max(0, Math.min(w.y1 ?? 50, 800)),
                    x2: Math.max(0, Math.min(w.x2 ?? 250, 1000)),
                    y2: Math.max(0, Math.min(w.y2 ?? 50, 800))
                }));
            });
        } else {
            state.rooms = [{ id: 'sala-principale', name: 'Sala Principale', walls: [] }];
        }

        if (state.rooms.length > 0) state.currentRoomId = state.rooms[0].id;

        // 2. OTTIMIZZAZIONE: CARICAMENTO IN PARALLELO DI TAVOLI E PRENOTAZIONI
        let queryTables = state.supabaseClient.from('tables').select('*');
        let queryBookings = state.supabaseClient.from('bookings').select('*');
        let queryWhatsappOrders = state.supabaseClient.from('whatsapp_orders').select('*').order('created_at', { ascending: false });

        if (restId !== 'tutti') {
            queryTables = queryTables.eq('restaurant_id', restId);
            queryBookings = queryBookings.eq('restaurant_id', restId);
            queryWhatsappOrders = queryWhatsappOrders.eq('restaurant_id', restId);
        }

        // Esegue le query simultaneamente invece di aspettarle in sequenza
        const [ 
            { data: tablesData, error: tablesError }, 
            { data: bookingsData, error: bookingsError },
            { data: whatsappOrdersData, error: whatsappOrdersError }
        ] = await Promise.all([queryTables, queryBookings, queryWhatsappOrders]);

        if (tablesError) throw tablesError;
        if (bookingsError) throw bookingsError;

        // 3. PARSING TAVOLI CON CONTROLLO CONFINI (Clamp)
        state.tables = (tablesData || []).map(t => {
            const width = t.width ?? (t.seats <= 2 ? 70 : t.seats <= 4 ? 90 : t.seats <= 8 ? 120 : 150);
            const height = t.height ?? (t.seats <= 8 ? 90 : 100);
            
            // Controlla che il tavolo caricato non sia fuori schermo
            const safePos = window.fermaEntroIConfini(t.pos_x ?? 50, t.pos_y ?? 50, 1000, 800, width, height);

            return {
                id: t.id,
                table_number: t.table_number,
                seats: t.seats,
                shape: t.shape,
                pos_x: safePos.x,
                pos_y: safePos.y,
                width: width,
                height: height,
                rotation: t.rotation ?? 0,
                room_id: t.room_id || 'sala-principale',
                restaurant_id: t.restaurant_id
            };
        });

        // 4. PARSING PRENOTAZIONI
        const parsedBookings = (bookingsData || []).map(b => ({
            id: b.id,
            tableId: b.table_id,
            date: b.date,
            startTime: b.start_time ? b.start_time.substring(0, 5) : '',
            endTime: b.end_time ? b.end_time.substring(0, 5) : '',
            name: b.name,
            guests: b.guests,
            phone: b.phone,
            restaurantId: b.restaurant_id,
            status: b.status || 'confirmed'
        }));
        state.bookings = parsedBookings.filter(booking => booking.status !== 'cancelled');
        state.cancelledBookings = parsedBookings.filter(booking => booking.status === 'cancelled');
        const whatsappOrdersErrorElement = document.getElementById('whatsapp-orders-error');
        if (whatsappOrdersError) {
            console.error('WhatsApp-Bestellungen konnten nicht geladen werden:', whatsappOrdersError.message);
            state.whatsappOrders = [];
            if (whatsappOrdersErrorElement) {
                whatsappOrdersErrorElement.textContent = 'WhatsApp-Bestellungen sind nicht verfügbar. Bitte Datenbankmigrationen und Berechtigungen prüfen.';
                whatsappOrdersErrorElement.classList.remove('hidden');
            }
        } else {
            state.whatsappOrders = whatsappOrdersData || [];
            if (whatsappOrdersErrorElement) {
                whatsappOrdersErrorElement.textContent = '';
                whatsappOrdersErrorElement.classList.add('hidden');
            }
        }

        refreshUI();
        renderWhatsappOrders();
        renderOrderingSettings();
        await loadWhatsappMessages();
    } catch (err) {
        console.error("Errore caricamento Supabase:", err.message);
    }
}

async function initRestaurantSelector() {
    const select = document.getElementById('restaurant-select');
    if (!select || !state.supabaseClient) return;

    let restaurantsQuery = state.supabaseClient.from('restaurants').select('*');
    if (!state.isAdmin) {
        restaurantsQuery = restaurantsQuery.eq('restaurant_id', state.currentRestaurantId);
    }
    const { data: restaurants, error } = await restaurantsQuery;
    if (error) {
        console.error("Errore caricamento ristoranti:", error);
        return;
    }

    state.allRestaurants = restaurants || [];

    if (!state.isAdmin) {
        const restaurant = state.allRestaurants.find(item => item.restaurant_id === state.currentRestaurantId);
        if (restaurant?.name) {
            state.currentRestaurantName = restaurant.name;
            document.getElementById('app-title').textContent = restaurant.name;
            localStorage.setItem('currentRestaurantName', restaurant.name);
        }
        select.style.display = 'none';
        renderOrderingSettings();
        return;
    }

    select.style.display = 'block';
    let optionsHtml = `<option value="tutti">Tutti i ristoranti / Admin (Vista Globale)</option>`;
    if (restaurants) {
        restaurants.forEach(r => {
            const isSelected = r.restaurant_id === state.currentRestaurantId ? 'selected' : '';
            optionsHtml += `<option value="${r.restaurant_id}" data-name="${r.name}" ${isSelected}>${r.name}</option>`;
        });
    }
    select.innerHTML = optionsHtml;

    select.onchange = async (e) => {
        const selectedId = e.target.value;
        const selectedOpt = e.target.options[e.target.selectedIndex];
        
        state.currentRestaurantId = selectedId;
        state.currentRestaurantName = selectedId === 'tutti' ? "Admin Globale" : (selectedOpt ? selectedOpt.getAttribute('data-name') : '');
        document.getElementById('app-title').textContent = state.currentRestaurantName || translations[state.currentLang].title;

        localStorage.setItem('currentRestaurantId', state.currentRestaurantId);
        localStorage.setItem('currentRestaurantName', state.currentRestaurantName);

        await loadData();
    };
    renderOrderingSettings();
}

function setupGlobalHeaderButtons() {
    const existing = document.getElementById('global-actions-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'global-actions-container';
    container.className = 'flex items-center space-x-2 ml-4';

    const isAdmin = state.isAdmin;

    let html = '';
    if (isAdmin) {
        html += `<button id="btn-create-restaurant-header" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition flex items-center space-x-1">
            <i class="fa-solid fa-plus"></i><span>Ristorante</span>
        </button>`;
    }

    html += `<button id="btn-logout-header" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition flex items-center space-x-1">
        <i class="fa-solid fa-right-from-bracket"></i><span>Esci</span>
    </button>`;

    container.innerHTML = html;

    const headerRight = document.querySelector('header .flex.items-center.space-x-4');
    if (headerRight) headerRight.appendChild(container);

    const btnCreate = document.getElementById('btn-create-restaurant-header');
    if (btnCreate) btnCreate.onclick = () => window.location.href = 'register.html';

    const btnLogout = document.getElementById('btn-logout-header');
    if (btnLogout) {
        btnLogout.onclick = async () => {
            try {
                if (state.supabaseClient) await state.supabaseClient.auth.signOut();
            } catch (e) {
                console.log("Logout:", e);
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'index.html';
        };
    }
}

function refreshUI() {
    renderRooms(refreshUI);
    renderCalendar(refreshUI);
    renderTables(openTableModal);
    renderDailySummary(deleteBooking, moveBookingToTable, restoreBooking);
}

function setupBookingUpdates() {
    if (!state.supabaseClient) return;

    let refreshTimeout;
    let orderRefreshTimeout;
    state.supabaseClient
        .channel('booking-status-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, payload => {
            const restId = state.currentRestaurantId;
            const changedBooking = payload.new || payload.old;
            if (
                restId !== 'tutti' &&
                changedBooking?.restaurant_id &&
                changedBooking.restaurant_id !== restId
            ) return;

            clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => loadData(), 150);
        })
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error(`Booking updates subscription failed: ${status}`);
            }
        });

    state.supabaseClient
        .channel('whatsapp-order-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_orders' }, () => {
            clearTimeout(orderRefreshTimeout);
            orderRefreshTimeout = setTimeout(() => loadData(), 200);
        })
        .subscribe();
}

function setupEventListeners() {
    document.getElementById('btn-it').addEventListener('click', () => setLanguage('it'));
    document.getElementById('btn-de').addEventListener('click', () => setLanguage('de'));

    document.getElementById('cal-prev').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
        renderCalendar(refreshUI);
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
        renderCalendar(refreshUI);
    });

    document.getElementById('filter-time').addEventListener('change', () => renderTables(openTableModal));
    document.getElementById('btn-toggle-edit').addEventListener('click', toggleEditMode);

    document.getElementById('btn-add-wall').addEventListener('click', addCustomWall);
    document.getElementById('btn-add-room').addEventListener('click', () => document.getElementById('room-config-modal').classList.remove('hidden'));
    document.getElementById('btn-add-table').addEventListener('click', () => document.getElementById('table-config-modal').classList.remove('hidden'));

    // Chiusura Modali
    const closeModal = (id) => document.getElementById(id).classList.add('hidden');
    document.getElementById('close-booking-modal').addEventListener('click', () => closeModal('booking-modal'));
    document.getElementById('close-table-config-modal').addEventListener('click', () => closeModal('table-config-modal'));
    document.getElementById('close-room-config-modal').addEventListener('click', () => closeModal('room-config-modal'));

    document.getElementById('booking-form').addEventListener('submit', saveBooking);
    document.getElementById('form-phone').addEventListener('input', checkClientPrivacy);

    document.getElementById('table-config-form').addEventListener('submit', saveNewTable);
    document.getElementById('room-config-form').addEventListener('submit', saveNewRoom);

    const orderingModal = document.getElementById('ordering-settings-modal');
    document.getElementById('btn-ordering-settings').addEventListener('click', () => orderingModal.classList.remove('hidden'));
    document.getElementById('close-ordering-settings').addEventListener('click', () => orderingModal.classList.add('hidden'));
    document.getElementById('ordering-phone').addEventListener('input', updateOrderingLink);
    document.getElementById('ordering-menu-url').addEventListener('input', updateOrderingLink);
    document.getElementById('ordering-enabled').addEventListener('change', updateOrderingRequirements);
    document.getElementById('ordering-settings-form').addEventListener('submit', saveOrderingSettings);
}

function renderOrderingSettings() {
    const restaurantId = state.currentRestaurantId;
    const button = document.getElementById('btn-ordering-settings');
    if (!button) return;
    button.classList.toggle('hidden', !restaurantId || restaurantId === 'tutti');

    const restaurant = state.allRestaurants?.find(item => item.restaurant_id === restaurantId);
    document.getElementById('ordering-enabled').checked = Boolean(restaurant?.whatsapp_ordering_enabled);
    document.getElementById('table-management-enabled').checked = restaurant?.table_management_enabled !== false;
    document.getElementById('ordering-menu-url').value = restaurant?.whatsapp_ordering_menu_url || '';
    document.getElementById('ordering-phone').value = restaurant?.whatsapp_ordering_phone || '';
    document.getElementById('ordering-settings-message').textContent = '';
    updateOrderingRequirements();
    updateOrderingLink();

    const orderSection = document.getElementById('whatsapp-orders-section');
    const isEnabled = Boolean(restaurant?.whatsapp_ordering_enabled);
    orderSection.classList.toggle('hidden', restaurantId === 'tutti' ? state.whatsappOrders.length === 0 : !isEnabled);

    const tableManagementEnabled = restaurantId === 'tutti'
        ? (state.allRestaurants || []).some(item => item.table_management_enabled !== false)
        : restaurant?.table_management_enabled !== false;
    document.getElementById('table-management-main').classList.toggle('hidden', !tableManagementEnabled);
    document.getElementById('booking-summary-section').classList.toggle('hidden', !tableManagementEnabled);
    document.getElementById('btn-toggle-edit').classList.toggle('hidden', !tableManagementEnabled);
}

function updateOrderingRequirements() {
    const isEnabled = document.getElementById('ordering-enabled').checked;
    document.getElementById('ordering-menu-url').required = isEnabled;
    document.getElementById('ordering-phone').required = isEnabled;
}

function updateOrderingLink() {
    const phone = document.getElementById('ordering-phone').value.replace(/\D/g, '');
    const menuUrl = document.getElementById('ordering-menu-url').value.trim();
    const message = `ORDER\nMenu: ${menuUrl}\nItems: `;
    document.getElementById('ordering-link').value = phone && menuUrl
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        : '';
}

async function saveOrderingSettings(event) {
    event.preventDefault();
    const message = document.getElementById('ordering-settings-message');
    const restaurantId = state.currentRestaurantId;
    if (!restaurantId || restaurantId === 'tutti') return;

    const updates = {
        whatsapp_ordering_enabled: document.getElementById('ordering-enabled').checked,
        table_management_enabled: document.getElementById('table-management-enabled').checked,
        whatsapp_ordering_menu_url: document.getElementById('ordering-menu-url').value.trim() || null,
        whatsapp_ordering_phone: document.getElementById('ordering-phone').value.trim() || null
    };
    const { data: updatedRows, error } = await state.supabaseClient
        .from('restaurants')
        .update(updates)
        .eq('restaurant_id', restaurantId)
        .select('restaurant_id');
    if (error) {
        message.textContent = `Speichern fehlgeschlagen: ${error.message}`;
        message.className = 'text-sm text-rose-700';
        return;
    }
    if (!updatedRows?.length) {
        message.textContent = 'Keine Restaurantzeile aktualisiert. Prüfe Restaurant-Zuordnung und Supabase-Berechtigungen.';
        message.className = 'text-sm text-rose-700';
        return;
    }

    const restaurant = state.allRestaurants.find(item => item.restaurant_id === restaurantId);
    if (restaurant) Object.assign(restaurant, updates);
    const status = document.getElementById('ordering-settings-status');
    status.textContent = 'WhatsApp-Einstellungen gespeichert.';
    status.classList.remove('hidden');
    window.setTimeout(() => {
        status.classList.add('hidden');
        status.textContent = '';
    }, 4000);
    document.getElementById('ordering-settings-modal').classList.add('hidden');
    renderOrderingSettings();
}

function formatPickupCountdown(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
    const hours = Math.floor(totalSeconds / 3600);
    return hours > 0
        ? `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`
        : `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${seconds}`;
}

function pickupStatus(order, now = Date.now()) {
    if (order.picked_up_at) return { label: 'Abgeholt', style: 'bg-slate-100 text-slate-700' };
    if (order.ready_at) {
        const remaining = new Date(order.ready_at).getTime() - now;
        if (remaining > 0) {
            return { label: `Abholbereit in ${formatPickupCountdown(remaining)}`, style: 'bg-amber-100 text-amber-800' };
        }
        return { label: 'Abholbereit', style: 'bg-emerald-100 text-emerald-800' };
    }
    if (order.status === 'rejected') return { label: 'Abgelehnt', style: 'bg-rose-100 text-rose-700' };
    if (order.status === 'accepted') return { label: 'Angenommen', style: 'bg-sky-100 text-sky-800' };
    return { label: 'Neu', style: 'bg-amber-100 text-amber-800' };
}

async function setWhatsappOrderPickedUp(order, pickedUp, button) {
    const errorElement = document.getElementById('whatsapp-orders-error');
    errorElement.classList.add('hidden');
    button.disabled = true;
    try {
        const updatePickupStatus = () => {
            let query = state.supabaseClient
                .from('whatsapp_orders')
                .update({ picked_up_at: pickedUp ? new Date().toISOString() : null })
                .eq('message_sid', order.message_sid)
                .eq('restaurant_id', order.restaurant_id);
            query = order.picked_up_at
                ? query.eq('picked_up_at', order.picked_up_at)
                : query.is('picked_up_at', null);
            return query.select('message_sid, picked_up_at').maybeSingle();
        };

        let result = await updatePickupStatus();
        if (result.error?.code === 'PGRST301') {
            const { data: sessionData, error: refreshError } = await state.supabaseClient.auth.refreshSession();
            if (refreshError || !sessionData.session) {
                if (refreshError) console.error('Supabase-Anmeldung konnte nicht aktualisiert werden:', refreshError);
                errorElement.textContent = 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an und versuche es noch einmal.';
                errorElement.classList.remove('hidden');
                return;
            }
            result = await updatePickupStatus();
        }

        const { data, error } = result;
        if (error || !data) {
            console.error('WhatsApp-Bestellstatus konnte nicht aktualisiert werden:', error);
            errorElement.textContent = error?.code === 'PGRST301'
                ? 'Supabase hat die Anmeldung auch nach dem Aktualisieren zurückgewiesen. Bitte melde dich erneut an.'
                : error?.message || 'Der Abholstatus wurde zwischenzeitlich geändert. Bitte aktualisiere die Ansicht.';
            errorElement.classList.remove('hidden');
            return;
        }
        Object.assign(order, data);
        renderWhatsappOrders();
    } catch (error) {
        console.error('WhatsApp-Bestellstatus konnte nicht aktualisiert werden:', error);
        errorElement.textContent = 'Der Abholstatus konnte wegen eines Netzwerkfehlers nicht aktualisiert werden.';
        errorElement.classList.remove('hidden');
    } finally {
        button.disabled = false;
    }
}

function tickWhatsappOrderCountdowns() {
    document.querySelectorAll('#whatsapp-orders-list [data-ready-at]').forEach(badge => {
        const remaining = new Date(badge.dataset.readyAt).getTime() - Date.now();
        if (remaining > 0) {
            badge.textContent = `Abholbereit in ${formatPickupCountdown(remaining)}`;
            return;
        }
        badge.textContent = 'Abholbereit';
        badge.className = 'inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800';
        delete badge.dataset.readyAt;
    });
}

function renderWhatsappOrders() {
    const list = document.getElementById('whatsapp-orders-list');
    if (!list) return;
    if (!whatsappOrderCountdownTimer) {
        whatsappOrderCountdownTimer = window.setInterval(tickWhatsappOrderCountdowns, 1000);
    }
    list.replaceChildren();
    const orders = state.whatsappOrders || [];
    const activeOrders = orders.filter(order => !order.picked_up_at);
    const completedOrders = orders.filter(order => order.picked_up_at);
    const openOrders = activeOrders.filter(order => order.status !== 'rejected').length;
    document.getElementById('whatsapp-orders-count').textContent = `${openOrders} offen`;

    if (activeOrders.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'py-3 text-sm text-gray-500';
        empty.textContent = orders.length === 0 ? 'Noch keine Bestellanfragen.' : 'Keine offenen Bestellungen.';
        list.append(empty);
    }

    activeOrders.forEach(order => renderWhatsappOrder(order, list));

    const completedSection = document.getElementById('whatsapp-orders-completed');
    const completedSummary = document.getElementById('whatsapp-orders-completed-summary');
    const completedList = document.getElementById('whatsapp-orders-completed-list');
    completedSection.classList.toggle('hidden', completedOrders.length === 0);
    completedSummary.textContent = `Abgeholte Bestellungen (${completedOrders.length})`;
    completedList.replaceChildren();
    completedOrders.forEach(order => renderWhatsappOrder(order, completedList));
}

function renderWhatsappOrder(order, list) {
    const row = document.createElement('article');
    row.className = 'py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3';
    const details = document.createElement('div');
    details.className = 'min-w-0 flex-1';
    const customerPhone = String(order.customer_phone || '');
    const phoneDigits = customerPhone.replace(/\D/g, '');
    const phone = document.createElement(phoneDigits ? 'a' : 'p');
    phone.className = 'mt-0.5 block text-xs text-gray-500 hover:text-emerald-700';
    phone.textContent = customerPhone;
    if (phoneDigits) {
        phone.href = `https://wa.me/${phoneDigits}`;
        phone.target = '_blank';
        phone.rel = 'noopener noreferrer';
        phone.setAttribute('aria-label', `WhatsApp-Chat mit ${order.customer_name || customerPhone} öffnen`);
    }
    const name = document.createElement('p');
    name.className = 'text-sm font-semibold text-gray-800';
    name.textContent = order.customer_name || 'Name nicht verfügbar';
    const text = document.createElement('p');
    text.className = 'mt-1 text-sm text-gray-700 whitespace-pre-wrap';
    text.textContent = order.order_text;
    details.append(name, phone, text);
    const status = pickupStatus(order);
    const statusBadge = document.createElement('span');
    statusBadge.className = `inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.style}`;
    statusBadge.textContent = status.label;
    if (!order.picked_up_at && order.status !== 'rejected' && order.ready_at && new Date(order.ready_at).getTime() > Date.now()) {
        statusBadge.dataset.readyAt = order.ready_at;
    }
    const actions = document.createElement('div');
    actions.className = 'flex shrink-0 flex-col items-start gap-2 sm:items-end';
    actions.append(statusBadge);
    const created = document.createElement('time');
    created.className = 'text-xs text-gray-500 shrink-0';
    created.dateTime = order.created_at;
    created.textContent = new Date(order.created_at).toLocaleString(state.currentLang === 'de' ? 'de-DE' : 'it-IT');
    actions.append(created);
    if (order.status !== 'rejected') {
        const pickupToggle = document.createElement('button');
        pickupToggle.type = 'button';
        pickupToggle.className = 'rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-wait disabled:opacity-50';
        pickupToggle.textContent = order.picked_up_at ? 'Als nicht abgeholt markieren' : 'Als abgeholt markieren';
        pickupToggle.addEventListener('click', () => setWhatsappOrderPickedUp(order, !order.picked_up_at, pickupToggle));
        actions.append(pickupToggle);
    }
    row.append(details, actions);
    list.append(row);
}

function setLanguage(lang) {
    state.currentLang = lang;
    const isIt = lang === 'it';
    
    document.getElementById('btn-it').className = isIt ? 'px-3 py-1 rounded-md text-sm font-medium bg-white shadow-sm' : 'px-3 py-1 rounded-md text-sm font-medium text-gray-600';
    document.getElementById('btn-de').className = !isIt ? 'px-3 py-1 rounded-md text-sm font-medium bg-white shadow-sm' : 'px-3 py-1 rounded-md text-sm font-medium text-gray-600';

    const t = translations[lang];
    const elementsToTranslate = {
        'opt-all': t.timeFilterAll, 'opt-lunch': t.timeFilterLunch,
        'opt-dinner1': t.timeFilterDinner1, 'opt-dinner2': t.timeFilterDinner2,
        'app-title': state.currentRestaurantName || t.title,
        'calendar-title': t.calendar, 'floor-title': t.floorTitle,
        'floor-subtitle': t.floorSubtitle, 'lbl-time-filter': t.timeFilter,
        'legend-title': t.legendTitle, 'leg-free': t.free,
        'leg-partial': t.partial, 'leg-full': t.full,
        'modal-existing-title': t.existingTitle, 'modal-form-title': t.formTitle,
        'lbl-start': t.lblStart, 'lbl-end': t.lblEnd,
        'lbl-name': t.lblName, 'lbl-guests': t.lblGuests,
        'lbl-phone': t.lblPhone, 'btn-save': t.btnSave,
        'txt-add-table': t.newTable, 'txt-add-room': t.newRoom,
        'txt-add-wall': t.addWall, 'summary-box-title': t.dailySummaryTitle,
        'summary-box-subtitle': t.dailySummarySub, 'lbl-total-guests-label': t.totalGuestsLabel,
        'cancelled-bookings-title': t.cancelledBookingsTitle,
        'cancelled-th-date': t.thDate,
        'cancelled-th-time': t.thTime, 'cancelled-th-table': t.thTable,
        'cancelled-th-name': t.thName, 'cancelled-th-guests': t.thGuests,
        'cancelled-th-actions': t.thActions,
        'th-time': t.thTime, 'th-table': t.thTable, 'th-name': t.thName,
        'th-guests': t.thGuests, 'th-phone': t.thPhone, 'th-actions': t.thActions,
        'txt-edit-mode': state.isEditMode ? t.editModeOn : t.editModeOff
    };

    for (const [id, text] of Object.entries(elementsToTranslate)) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    checkClientPrivacy();
    refreshUI();
}

function toggleEditMode() {
    state.isEditMode = !state.isEditMode;
    const btnEdit = document.getElementById('btn-toggle-edit');
    const btnAddTable = document.getElementById('btn-add-table');
    const btnAddRoom = document.getElementById('btn-add-room');
    const btnAddWall = document.getElementById('btn-add-wall');
    const t = translations[state.currentLang];

    if (state.isEditMode) {
        btnEdit.className = "px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white shadow-sm transition flex items-center space-x-1.5";
        document.getElementById('txt-edit-mode').innerText = t.editModeOn;
        btnAddTable.classList.remove('hidden');
        btnAddRoom.classList.remove('hidden');
        btnAddWall.classList.remove('hidden');
    } else {
        btnEdit.className = "px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition flex items-center space-x-1.5";
        document.getElementById('txt-edit-mode').innerText = t.editModeOff;
        btnAddTable.classList.add('hidden');
        btnAddRoom.classList.add('hidden');
        btnAddWall.classList.add('hidden');
    }
    renderTables(openTableModal);
}

async function saveRoomsToLocal() {
    const restId = state.currentRestaurantId || localStorage.getItem('currentRestaurantId');
    if (!state.rooms || state.rooms.length === 0) return;
    
    const roomsData = JSON.stringify(state.rooms);
    
    if (restId) {
        localStorage.setItem('restabook_rooms_' + restId, roomsData);
        localStorage.setItem('rooms_' + restId, roomsData);
    }
    localStorage.setItem('restabook_rooms_global', roomsData);

    if (state.supabaseClient && restId && restId !== 'tutti') {
        try {
            const { error } = await state.supabaseClient
                .from('restaurants')
                .update({ rooms_config: state.rooms })
                .eq('restaurant_id', restId);

            if (error) console.error("Errore nel salvataggio su Supabase:", error.message);
        } catch (err) {
            console.error("Errore di rete durante il salvataggio:", err);
        }
    }
}

async function addCustomWall() {
    let room = state.rooms.find(r => r.id === state.currentRoomId) || state.rooms[0];
    if (room) state.currentRoomId = room.id;
    
    if (room) {
        if (!room.walls) room.walls = [];
        room.walls.push({ x1: 50, y1: 50, x2: 250, y2: 50, type: 'wall' });
        
        if (window.saveRoomsToLocal) window.saveRoomsToLocal();
        refreshUI();
    }
}

function openTableModal(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;
    const currentDateStr = formatDateKey(state.currentDate);

    document.getElementById('modal-table-title').innerText = `Tavolo / Tisch ${table.table_number}`;
    document.getElementById('modal-table-info').innerText = `${translations[state.currentLang].seats}: ${table.seats} | Data: ${currentDateStr}`;
    document.getElementById('form-table-id').value = tableId;

    document.getElementById('booking-form').reset();
    checkClientPrivacy();

    const rotateBtnContainer = document.getElementById('modal-rotate-container');
    rotateBtnContainer.innerHTML = `
        <button type="button" id="delete-table-modal-btn" class="w-full bg-rose-600 text-white font-medium py-1.5 rounded-lg hover:bg-rose-700 transition text-xs mb-3">
            <i class="fa-solid fa-trash mr-1"></i> Elimina Tavolo / Tisch löschen
        </button>
    `;

    document.getElementById('delete-table-modal-btn').onclick = async () => {
        const hasBookings = [...state.bookings, ...state.cancelledBookings].some(booking => booking.tableId === tableId);
        if (hasBookings) {
            alert(translations[state.currentLang].cannotDeleteTableBookings);
            return;
        }
        const { error } = await state.supabaseClient.from('tables').delete().eq('id', tableId);
        if (error) {
            alert(error.message);
            return;
        }
        document.getElementById('booking-modal').classList.add('hidden');
        await loadData();
    };

    const listContainer = document.getElementById('modal-bookings-list');
    const tableBookings = state.bookings.filter(b => b.tableId === tableId && b.date === currentDateStr);

    listContainer.innerHTML = '';
    if (tableBookings.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-gray-400 italic">${translations[state.currentLang].noBookings}</p>`;
    } else {
        tableBookings.forEach(b => {
            const item = document.createElement('div');
            item.className = "flex justify-between items-center bg-gray-50 border border-gray-200 p-2 rounded-lg text-xs";
            item.innerHTML = `
                <div>
                    <span class="font-bold text-indigo-600">${b.startTime} - ${b.endTime}</span>
                    <span class="font-semibold ml-2">${b.name}</span> (${b.guests} pers.)
                </div>
                <button class="delete-b-btn text-rose-500 hover:text-rose-700 p-1" title="${translations[state.currentLang].cancelBooking}"><i class="fa-solid fa-ban"></i></button>
            `;
            item.querySelector('.delete-b-btn').onclick = () => deleteBooking(b.id);
            listContainer.appendChild(item);
        });
    }

    document.getElementById('booking-modal').classList.remove('hidden');
}

async function saveBooking(e) {
    e.preventDefault();
    if (!state.supabaseClient) return;

    const form = document.getElementById('booking-form');
    const submitButton = form.querySelector('[type="submit"]');
    if (form.dataset.saving === 'true') return;
    form.dataset.saving = 'true';
    submitButton.disabled = true;

    try {
        const tableId = document.getElementById('form-table-id').value;
        const startTime = document.getElementById('form-start-time').value;
        const endTime = document.getElementById('form-end-time').value;
        const name = document.getElementById('form-name').value;
        const guests = parseInt(document.getElementById('form-guests').value, 10);
        const phone = document.getElementById('form-phone').value;
        const dateStr = formatDateKey(state.currentDate);

        const table = state.tables.find(t => t.id === tableId);
        const t = translations[state.currentLang];

        if (!table) return;

        if (guests > table.seats) {
            alert(t.errCapacity + table.seats + ")");
            return;
        }

        const existingTableBookings = state.bookings.filter(b => b.tableId === tableId && b.date === dateStr);
        const hasOverlap = existingTableBookings.some(b => startTime < b.endTime && endTime > b.startTime);

        if (hasOverlap) {
            alert(t.errOverlap);
            return;
        }

        const { error } = await state.supabaseClient
            .from('bookings')
            .insert([{
                table_id: tableId,
                date: dateStr,
                start_time: startTime,
                end_time: endTime,
                name: name,
                guests: guests,
                phone: phone,
                restaurant_id: state.currentRestaurantId
            }]);

        if (error) {
            alert("Errore salvataggio: " + error.message);
            return;
        }

        await loadData();
        document.getElementById('booking-modal').classList.add('hidden');
        form.reset();
    } finally {
        form.dataset.saving = 'false';
        submitButton.disabled = false;
    }
}

async function deleteBooking(bookingId) {
    if (!state.supabaseClient) return;
    const t = translations[state.currentLang];
    const { error } = await state.supabaseClient
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .eq('status', 'confirmed');
    if (error) {
        alert(`${t.cancelBookingFailed}: ${error.message}`);
        return false;
    }
    await loadData();
    document.getElementById('booking-modal').classList.add('hidden');
    return true;
}

async function restoreBooking(bookingId) {
    if (!state.supabaseClient) return;

    const booking = state.cancelledBookings.find(item => item.id === bookingId);
    if (!booking) return;
    const t = translations[state.currentLang];
    const isAvailable = table => state.bookings.every(other =>
        other.tableId !== table.id ||
        other.date !== booking.date ||
        !(booking.startTime < other.endTime && booking.endTime > other.startTime)
    );
    const candidates = state.tables
        .filter(table =>
            table.restaurant_id === booking.restaurantId &&
            Number(table.seats) >= Number(booking.guests) &&
            isAvailable(table)
        )
        .sort((a, b) => Number(a.seats) - Number(b.seats));
    const targetTable = candidates.find(table => table.id === booking.tableId) || candidates[0];

    if (!targetTable) {
        alert(t.restoreNoTable);
        return false;
    }

    const { data, error } = await state.supabaseClient
        .from('bookings')
        .update({ status: 'confirmed', table_id: targetTable.id })
        .eq('id', booking.id)
        .eq('status', 'cancelled')
        .select('id')
        .maybeSingle();
    if (error) {
        alert(error.code === '23P01'
            ? t.restoreNoTable
            : `${t.restoreBookingFailed}: ${error.message}`);
        await loadData();
        return false;
    }
    if (!data) {
        await loadData();
        return false;
    }
    await loadData();
    return true;
}

async function moveBookingToTable(bookingId, newTableId) {
    if (!state.supabaseClient) return;

    const booking = state.bookings.find(b => b.id === bookingId);
    const currentTable = state.tables.find(table => table.id === booking?.tableId);
    const targetTable = state.tables.find(table => table.id === newTableId);
    const restaurantId = booking?.restaurantId || currentTable?.restaurant_id;
    const t = translations[state.currentLang];

    if (!booking || !targetTable || targetTable.restaurant_id !== restaurantId) return;
    if (Number(targetTable.seats) < Number(booking.guests)) {
        alert(t.errCapacity + targetTable.seats + ")");
        await refreshUI();
        return;
    }

    const hasOverlap = state.bookings.some(other =>
        other.id !== booking.id &&
        other.tableId === targetTable.id &&
        other.date === booking.date &&
        booking.startTime < other.endTime &&
        booking.endTime > other.startTime
    );
    if (hasOverlap) {
        alert(t.errOverlap);
        await refreshUI();
        return;
    }

    let query = state.supabaseClient
        .from('bookings')
        .update({ table_id: targetTable.id })
        .eq('id', booking.id);
    if (restaurantId) query = query.eq('restaurant_id', restaurantId);

    const { error } = await query;
    if (error) {
        alert(error.code === '23P01' ? t.errOverlap : `${t.moveTableFailed}: ${error.message}`);
        await loadData();
        return;
    }

    await loadData();
}

async function saveNewTable(e) {
    e.preventDefault();
    if (!state.supabaseClient) return;
    const tableNumber = document.getElementById('new-table-number').value;
    const seats = parseInt(document.getElementById('new-table-seats').value, 10);
    const shape = document.getElementById('new-table-shape').value;

    const { error } = await state.supabaseClient
        .from('tables')
        .insert([{
            table_number: tableNumber,
            seats: seats,
            shape: shape,
            pos_x: 50,
            pos_y: 50,
            width: seats <= 2 ? 70 : seats <= 4 ? 90 : 120,
            height: 90,
            rotation: 0,
            room_id: state.currentRoomId,
            restaurant_id: state.currentRestaurantId,
            restaurant_name: state.currentRestaurantName
        }]);

    if (error) {
        alert("Errore nella creazione del tavolo: " + error.message);
        return;
    }

    document.getElementById('table-config-modal').classList.add('hidden');
    document.getElementById('new-table-number').value = '';
    await loadData();
}

async function saveNewRoom(e) {
    e.preventDefault();
    const roomName = document.getElementById('new-room-name').value.trim();
    if (!roomName) return;

    const newId = 'sala-' + Date.now();
    state.rooms.push({ 
        id: newId, 
        name: roomName,
        walls: []
    });
    state.currentRoomId = newId;
    if (window.saveRoomsToLocal) window.saveRoomsToLocal();
    document.getElementById('room-config-modal').classList.add('hidden');
    document.getElementById('new-room-name').value = '';
    refreshUI();
}

function checkClientPrivacy() {
    const privacyContainer = document.getElementById('privacy-container');
    const privacyConsent = document.getElementById('privacy-consent');
    const privacyLabel = document.getElementById('privacy-label-text');
    const t = translations[state.currentLang];

    if (!privacyConsent) return;

    privacyConsent.required = false;
    privacyConsent.checked = true; 

    if (privacyContainer) {
        privacyContainer.classList.add('bg-indigo-50/60', 'border', 'border-indigo-100', 'p-2', 'rounded-lg');
    }
    
    if (privacyLabel) {
        privacyLabel.innerText = t.privacyText || "Datenschutzbestimmungen akzeptiert";
    }
}

// Rendi globale la funzione di salvataggio per farla usare anche a floor.js
window.saveRoomsToLocal = saveRoomsToLocal;
