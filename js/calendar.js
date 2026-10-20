import { state, translations } from './config.js';


export function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function renderCalendar(onSelectCallback) {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const monthsIt = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
    const monthsDe = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    
    document.getElementById('month-year-label').innerText = `${state.currentLang === 'it' ? monthsIt[month] : monthsDe[month]} ${year}`;
    document.getElementById('current-date-display').innerText = state.currentDate.toLocaleDateString(state.currentLang === 'it' ? 'it-IT' : 'de-DE', { weekday: 'short', day: 'numeric', month: 'short' });

    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const daysContainer = document.getElementById('calendar-days');
    daysContainer.innerHTML = '';
    renderDailySummary();

    for (let i = 0; i < firstDayIndex; i++) {
        daysContainer.innerHTML += `<div></div>`;
    }

    const selectedStr = formatDateKey(state.currentDate);
    for (let d = 1; d <= totalDays; d++) {
        const dateTest = new Date(year, month, d);
        const dateStr = formatDateKey(dateTest);
        const isSelected = dateStr === selectedStr;
        const hasBookings = state.bookings.some(b => b.date === dateStr);

        let btnClass = "h-8 w-8 mx-auto rounded-full flex items-center justify-center text-xs font-medium transition cursor-pointer relative ";
        if (isSelected) {
            btnClass += "bg-indigo-600 text-white shadow-md";
        } else {
            btnClass += "hover:bg-gray-100 text-gray-700";
        }

        const dayWrapper = document.createElement('div');
        dayWrapper.innerHTML = `
            <button class="${btnClass}">
                ${d}
                ${hasBookings && !isSelected ? '<span class="absolute bottom-1 w-1 h-1 bg-indigo-500 rounded-full"></span>' : ''}
            </button>
        `;
        dayWrapper.onclick = () => {
            state.currentDate = new Date(year, month, d);
            renderCalendar(onSelectCallback);
            if (onSelectCallback) onSelectCallback();
        };
        daysContainer.appendChild(dayWrapper);
    }
}

export function renderDailySummary(onDeleteBooking, onMoveBooking, onRestoreBooking) {
    const currentDateStr = formatDateKey(state.currentDate);
    const tbody = document.getElementById('daily-summary-list');
    const cancelledTbody = document.getElementById('cancelled-bookings-list');
    const cancelledContainer = document.getElementById('cancelled-bookings-container');
    const totalCountEl = document.getElementById('total-guests-count');
    const capacityCaptionEl = document.getElementById('guest-capacity-caption');
    const t = translations[state.currentLang];

    const dayBookings = state.bookings
        .filter(b => b.date === currentDateStr)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const cancelledBookings = (state.cancelledBookings || [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const selectedRestaurant = state.allRestaurants?.find(
        restaurant => restaurant.restaurant_id === state.currentRestaurantId
    );
    const tableCapacity = state.tables.reduce((total, table) => total + (Number(table.seats) || 0), 0);
    const getRestaurantCapacity = restaurant => {
        const configured = restaurant?.max_capacity;
        const capacity = configured === null || configured === undefined || configured === ''
            ? NaN
            : Number(configured);
        return Number.isFinite(capacity) && capacity >= 0
            ? capacity
            : state.tables
                .filter(table => table.restaurant_id === restaurant?.restaurant_id)
                .reduce((total, table) => total + (Number(table.seats) || 0), 0);
    };
    const capacity = state.currentRestaurantId === 'tutti'
        ? (state.allRestaurants || []).reduce((total, restaurant) => total + getRestaurantCapacity(restaurant), 0)
        : selectedRestaurant
            ? getRestaurantCapacity(selectedRestaurant)
            : tableCapacity;

    tbody.innerHTML = '';
    let totalGuests = 0;

    if (dayBookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-gray-400 italic">${t.noDailyBookings}</td></tr>`;
    } else {
        dayBookings.forEach(b => {
            totalGuests += Number(b.guests) || 0;
            const tableObj = state.tables.find(table => table.id === b.tableId);

            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50/85 transition";
            tr.innerHTML = `
                <td class="py-3 px-3 font-bold text-indigo-600">${b.startTime} - ${b.endTime}</td>
                <td class="py-3 px-3 font-semibold"></td>
                <td class="py-3 px-3 font-medium text-gray-900">${b.name}</td>
                <td class="py-3 px-3"><span class="bg-gray-100 px-2 py-0.5 rounded-md font-bold">${b.guests}</span></td>
                <td class="py-3 px-3 text-gray-500">${b.phone || '-'}</td>
                <td class="py-3 px-3 text-right">
                    <button class="delete-summary-btn text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition" title="${t.cancelBooking}">
                        <i class="fa-solid fa-ban"></i>
                    </button>
                </td>
            `;
            const tableCell = tr.children[1];
            const restaurantId = b.restaurantId || tableObj?.restaurant_id;
            const candidateTables = state.tables.filter(table => {
                if (table.restaurant_id !== restaurantId) return false;
                if (table.id === b.tableId) return true;
                if (Number(table.seats) < Number(b.guests)) return false;
                return !state.bookings.some(other =>
                    other.id !== b.id &&
                    other.tableId === table.id &&
                    other.date === b.date &&
                    b.startTime < other.endTime &&
                    b.endTime > other.startTime
                );
            }).sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true }));

            if (candidateTables.length > 1 && onMoveBooking) {
                const select = document.createElement('select');
                select.className = 'max-w-28 bg-white border border-gray-200 rounded px-2 py-1 text-xs font-semibold';
                select.setAttribute('aria-label', `${t.moveTable}: ${b.name}`);
                candidateTables.forEach(table => {
                    const option = document.createElement('option');
                    option.value = table.id;
                    option.textContent = `T-${table.table_number}`;
                    option.selected = table.id === b.tableId;
                    select.appendChild(option);
                });
                select.addEventListener('change', async () => {
                    select.disabled = true;
                    await onMoveBooking(b.id, select.value);
                });
                tableCell.appendChild(select);
            } else {
                tableCell.textContent = tableObj ? `T-${tableObj.table_number}` : '-';
            }
            if (onDeleteBooking) {
                tr.querySelector('.delete-summary-btn').onclick = () => onDeleteBooking(b.id);
            }
            tbody.appendChild(tr);
        });
    }

    totalCountEl.innerText = `${Math.max(0, capacity - totalGuests)}/${totalGuests}`;
    capacityCaptionEl.innerText = t.guestCapacityCaption(capacity);

    cancelledTbody.innerHTML = '';
    cancelledContainer.classList.toggle('hidden', cancelledBookings.length === 0);
    if (cancelledBookings.length === 0) {
        cancelledTbody.innerHTML = `<tr><td colspan="5" class="py-3 text-center text-gray-400 italic">${t.noCancelledBookings}</td></tr>`;
        return;
    }

    cancelledBookings.forEach(booking => {
        const table = state.tables.find(item => item.id === booking.tableId);
        const row = document.createElement('tr');
        row.className = 'text-gray-500';
        const bookingDate = new Date(`${booking.date}T00:00:00`).toLocaleDateString(
            state.currentLang === 'it' ? 'it-IT' : 'de-DE',
            { day: '2-digit', month: '2-digit', year: 'numeric' }
        );
        row.innerHTML = `
            <td class="py-2 px-3">${bookingDate}</td>
            <td class="py-2 px-3">${booking.startTime} - ${booking.endTime}</td>
            <td class="py-2 px-3">${table ? `T-${table.table_number}` : '-'}</td>
            <td class="py-2 px-3">${booking.name}</td>
            <td class="py-2 px-3">${booking.guests}</td>
            <td class="py-2 px-3 text-right"></td>
        `;
        const actionCell = row.children[4];
        const restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'text-emerald-700 hover:text-emerald-900 font-semibold px-2 py-1 rounded hover:bg-emerald-50';
        restoreButton.textContent = t.restoreBooking;
        restoreButton.addEventListener('click', async () => {
            restoreButton.disabled = true;
            const restored = await onRestoreBooking(booking.id);
            if (!restored) restoreButton.disabled = false;
        });
        actionCell.appendChild(restoreButton);
        cancelledTbody.appendChild(row);
    });
}
