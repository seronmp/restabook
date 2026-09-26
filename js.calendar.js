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

export function renderDailySummary(onDeleteBooking) {
    const currentDateStr = formatDateKey(state.currentDate);
    const tbody = document.getElementById('daily-summary-list');
    const totalCountEl = document.getElementById('total-guests-count');
    const t = translations[state.currentLang];

    const dayBookings = state.bookings
        .filter(b => b.date === currentDateStr)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

    tbody.innerHTML = '';
    let totalGuests = 0;

    if (dayBookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-gray-400 italic">${t.noDailyBookings}</td></tr>`;
        totalCountEl.innerText = '0';
        return;
    }

    dayBookings.forEach(b => {
        totalGuests += b.guests;
        const tableObj = state.tables.find(t => t.id === b.tableId);
        const tableNum = tableObj ? tableObj.table_number : '-';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/85 transition";
        tr.innerHTML = `
            <td class="py-3 px-3 font-bold text-indigo-600">${b.startTime} - ${b.endTime}</td>
            <td class="py-3 px-3 font-semibold">T-${tableNum}</td>
            <td class="py-3 px-3 font-medium text-gray-900">${b.name}</td>
            <td class="py-3 px-3"><span class="bg-gray-100 px-2 py-0.5 rounded-md font-bold">${b.guests}</span></td>
            <td class="py-3 px-3 text-gray-500">${b.phone || '-'}</td>
            <td class="py-3 px-3 text-right">
                <button class="delete-summary-btn text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition" title="Elimina">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tr.querySelector('.delete-summary-btn').onclick = () => onDeleteBooking(b.id);
        tbody.appendChild(tr);
    });

    totalCountEl.innerText = totalGuests;
}
