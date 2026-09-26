import { state, translations } from './config.js';
import { formatDateKey } from './calendar.js';

export function renderRooms(onRoomChange) {
    const container = document.getElementById('rooms-tabs-container');
    if (!container) return;
    container.innerHTML = '';

    state.rooms.forEach(room => {
        const isActive = room.id === state.currentRoomId;
        const btn = document.createElement('button');
        btn.className = `px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${isActive ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`;
        btn.innerText = room.name;
        btn.onclick = () => {
            state.currentRoomId = room.id;
            renderRooms(onRoomChange);
            if (onRoomChange) onRoomChange();
        };
        container.appendChild(btn);
    });
}

export function renderTables(onTableClick) {
    const canvas = document.getElementById('floor-canvas');
    canvas.innerHTML = '';
    const currentDateStr = formatDateKey(state.currentDate);
    const timeFilter = document.getElementById('filter-time').value;
    const roomObj = state.rooms.find(r => r.id === state.currentRoomId) || state.rooms[0];

    if (roomObj && roomObj.walls) {
        roomObj.walls.forEach((wall, wallIndex) => {
            const dx = wall.x2 - wall.x1;
            const dy = wall.y2 - wall.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            const wallDiv = document.createElement('div');
            const isDoor = wall.type === 'door';
            wallDiv.className = `absolute ${isDoor ? 'bg-amber-200/90 border border-dashed border-amber-500 h-2' : 'bg-slate-700 h-1.5'} rounded transition-all`;
            wallDiv.style.left = `${wall.x1}px`;
            wallDiv.style.top = `${wall.y1}px`;
            wallDiv.style.width = `${length}px`;
            wallDiv.style.transformOrigin = '0 0';
            wallDiv.style.transform = `rotate(${angle}deg)`;

            if (isDoor) {
                const doorLabel = state.currentLang === 'de' ? 'Tür / Durchgang' : 'Porta / Varco';
                wallDiv.innerHTML = `<span class="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-bold text-amber-800 bg-amber-100 px-1 rounded pointer-events-none">${doorLabel}</span>`;
            }

            if (state.isEditMode) {
                wallDiv.classList.add('cursor-pointer', 'ring-2', 'ring-indigo-400');
                const midControl = document.createElement('div');
                midControl.className = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center space-x-1 z-30 opacity-90';
                
                const splitLabel = state.currentLang === 'de' ? 'Teilen' : 'Dividi';
                const deleteLabel = state.currentLang === 'de' ? 'Löschen' : 'Elimina';

                midControl.innerHTML = `
                    <button class="split-btn bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold shadow hover:bg-indigo-700">${splitLabel}</button>
                    <button class="delete-btn bg-rose-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold shadow hover:bg-rose-700"><i class="fa-solid fa-xmark"></i></button>
                `;
                
                midControl.querySelector('.split-btn').onclick = (e) => {
                    e.stopPropagation();
                    splitWall(roomObj, wallIndex);
                };
                midControl.querySelector('.delete-btn').onclick = (e) => {
                    e.stopPropagation();
                    removeWall(roomObj, wallIndex);
                };
                wallDiv.appendChild(midControl);

                wallDiv.onclick = (e) => {
                    if(e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                    wall.type = wall.type === 'wall' ? 'door' : 'wall';
                    renderTables(onTableClick);
                };

                const h1 = document.createElement('div');
                h1.className = 'absolute w-4 h-4 bg-indigo-600 rounded-full -translate-x-2 -translate-y-2 cursor-pointer z-40 shadow-md flex items-center justify-center text-white text-[9px] hover:scale-110 transition';
                h1.style.left = `${wall.x1}px`;
                h1.style.top = `${wall.y1}px`;
                h1.innerHTML = '<i class="fa-solid fa-arrows-up-down-left-right text-[7px]"></i>';
                enableWallDrag(h1, wall, 'start', onTableClick);
                canvas.appendChild(h1);

                const h2 = document.createElement('div');
                h2.className = 'absolute w-4 h-4 bg-indigo-600 rounded-full -translate-x-2 -translate-y-2 cursor-pointer z-40 shadow-md flex items-center justify-center text-white text-[9px] hover:scale-110 transition';
                h2.style.left = `${wall.x2}px`;
                h2.style.top = `${wall.y2}px`;
                h2.innerHTML = '<i class="fa-solid fa-arrows-up-down-left-right text-[7px]"></i>';
                enableWallDrag(h2, wall, 'end', onTableClick);
                canvas.appendChild(h2);
            }

            canvas.appendChild(wallDiv);
        });
    }

    const roomTables = state.tables.filter(t => (t.room_id || 'sala-principale') === state.currentRoomId);
    roomTables.forEach(table => {
        let tableBookings = state.bookings.filter(b => b.tableId === table.id && b.date === currentDateStr);

        if (timeFilter !== 'all') {
            const [fStart, fEnd] = timeFilter.split('-');
            tableBookings = tableBookings.filter(b => b.startTime < fEnd && b.endTime > fStart);
        }

        let statusColor = "bg-emerald-50 border-emerald-300 text-emerald-900";
        let badgeColor = "bg-emerald-500";
        let statusText = translations[state.currentLang].free;

        if (tableBookings.length > 0 && timeFilter === 'all') {
            statusColor = "bg-amber-50 border-amber-300 text-amber-900";
            badgeColor = "bg-amber-500";
            statusText = `${tableBookings.length} ris.`;
        } else if (tableBookings.length > 0) {
            statusColor = "bg-rose-50 border-rose-300 text-rose-900";
            badgeColor = "bg-rose-500";
            statusText = translations[state.currentLang].full;
        }

        let width = table.width ?? 90;
        let height = table.height ?? 90;
        const shapeClass = table.shape === 'circle' ? 'rounded-full' : 'rounded-xl';

        const tableEl = document.createElement('div');
        tableEl.className = `absolute border-2 ${statusColor} ${shapeClass} p-2 flex flex-col justify-between shadow-sm transition-colors select-none cursor-pointer hover:shadow-md z-20`;
        tableEl.style.left = `${table.pos_x ?? 50}px`;
        tableEl.style.top = `${table.pos_y ?? 50}px`;
        tableEl.style.width = `${width}px`;
        tableEl.style.height = `${height}px`;
        tableEl.style.transform = `rotate(${table.rotation ?? 0}deg)`;

        let editControlsHtml = '';
        if (state.isEditMode) {
            editControlsHtml = `
                <button class="delete-table-btn absolute -top-2 -right-2 bg-rose-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] shadow-md hover:bg-rose-700 transition z-30" title="Elimina Tavolo">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <button class="rotate-table-btn absolute -top-2 left-1 bg-amber-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold shadow hover:bg-amber-600 z-30" title="Ruota 90°">
                    <i class="fa-solid fa-rotate"></i> 90°
                </button>
                <div class="absolute -bottom-2 -right-2 w-4 h-4 bg-indigo-600 rounded-full cursor-se-resize z-40 shadow flex items-center justify-center text-white text-[8px]" title="Trascina per ridimensionare" id="resize-handle-${table.id}">
                    <i class="fa-solid fa-expand text-[7px]"></i>
                </div>
            `;
        }

        let seatsControlHtml = state.isEditMode ? `
            <div class="seats-control-box flex items-center justify-center space-x-1 my-auto bg-white/80 rounded px-1 py-0.5 z-30 shadow-xs">
                <span class="text-[9px] font-bold text-gray-700">Posti:</span>
                <input type="number" min="1" max="30" value="${table.seats}" class="table-seats-input w-8 text-center text-xs font-black bg-white border border-gray-300 rounded">
            </div>
        ` : `
            <div class="text-center pointer-events-none my-auto">
                <h3 class="text-sm font-black">${table.table_number}</h3>
                <div class="text-[9px] opacity-80"><i class="fa-solid fa-user-group"></i> ${table.seats} p.</div>
            </div>
        `;

        tableEl.innerHTML = `
            ${editControlsHtml}
            <div class="flex justify-between items-start pointer-events-none">
                <span class="text-[10px] font-black opacity-70">T-${table.table_number}</span>
                <span class="w-2 h-2 ${badgeColor} rounded-full inline-block"></span>
            </div>
            ${seatsControlHtml}
            <div class="text-[9px] font-bold text-center truncate pointer-events-none opacity-90">${statusText}</div>
        `;

        if (state.isEditMode) {
            tableEl.querySelector('.delete-table-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTableAction(table.id);
            });
            tableEl.querySelector('.rotate-table-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                rotateTableAction(table.id, onTableClick);
            });
            tableEl.querySelector('.table-seats-input')?.addEventListener('change', async (e) => {
                e.stopPropagation();
                await updateTableSeatsAction(table.id, e.target.value);
            });
            tableEl.querySelector('.table-seats-input')?.addEventListener('click', (e) => e.stopPropagation());
        }

        tableEl.addEventListener('click', () => {
            if (!state.isEditMode && onTableClick) onTableClick(table.id);
        });

        if (state.isEditMode) {
            tableEl.classList.add('cursor-move', 'ring-2', 'ring-indigo-400', 'ring-offset-1');
            enableTableDrag(tableEl, table.id, width, height);
            
            setTimeout(() => {
                const resizeHandle = document.getElementById(`resize-handle-${table.id}`);
                if (resizeHandle) {
                    enableTableResize(resizeHandle, tableEl, table.id);
                }
            }, 0);
        }

        canvas.appendChild(tableEl);
    });
}

function splitWall(roomObj, index) {
    const w = roomObj.walls[index];
    const midX = Math.round((w.x1 + w.x2) / 2);
    const midY = Math.round((w.y1 + w.y2) / 2);

    const newWallSegment = { x1: midX, y1: midY, x2: w.x2, y2: w.y2, type: w.type };
    w.x2 = midX;
    w.y2 = midY;

    roomObj.walls.splice(index + 1, 0, newWallSegment);
    renderTables();
}

function removeWall(roomObj, index) {
    if (roomObj.walls.length <= 3) {
        alert("Una stanza deve avere almeno 3 segmenti di muro.");
        return;
    }
    roomObj.walls.splice(index, 1);
    renderTables();
}

function applyMagneticSnap(x, y, roomObj, snapThreshold = 14) {
    let snappedX = x;
    let snappedY = y;
    const gridSize = 20;
    const gridX = Math.round(x / gridSize) * gridSize;
    const gridY = Math.round(y / gridSize) * gridSize;

    if (Math.abs(x - gridX) < snapThreshold) snappedX = gridX;
    if (Math.abs(y - gridY) < snapThreshold) snappedY = gridY;

    if (roomObj && roomObj.walls) {
        roomObj.walls.forEach(wall => {
            if (Math.abs(wall.x1 - x) < snapThreshold) snappedX = wall.x1;
            if (Math.abs(wall.y1 - y) < snapThreshold) snappedY = wall.y1;
            if (Math.abs(wall.x2 - x) < snapThreshold) snappedX = wall.x2;
            if (Math.abs(wall.y2 - y) < snapThreshold) snappedY = wall.y2;
        });
    }
    return { x: snappedX, y: snappedY };
}

function enableWallDrag(handleEl, wallObj, pointType, callback) {
    let isDragging = false;
    handleEl.style.touchAction = 'none';

    handleEl.addEventListener('pointerdown', (e) => {
        if (!state.isEditMode) return;
        isDragging = true;
        handleEl.setPointerCapture(e.pointerId);
        e.stopPropagation();
    });

    document.addEventListener('pointermove', (e) => {
        if (!isDragging || !state.isEditMode) return;
        const canvas = document.getElementById('floor-canvas');
        const rect = canvas.getBoundingClientRect();
        
        let rawX = Math.max(0, Math.min(e.clientX - rect.left, canvas.clientWidth));
        let rawY = Math.max(0, Math.min(e.clientY - rect.top, canvas.clientHeight));

        const roomObj = state.rooms.find(r => r.id === state.currentRoomId);
        const snapped = applyMagneticSnap(rawX, rawY, roomObj);

        if (pointType === 'start') {
            wallObj.x1 = snapped.x;
            wallObj.y1 = snapped.y;
        } else {
            wallObj.x2 = snapped.x;
            wallObj.y2 = snapped.y;
        }
        renderTables(callback);
    });

    document.addEventListener('pointerup', () => { isDragging = false; });
}

function enableTableDrag(element, tableId, width, height) {
    let isDragging = false;
    let startX, startY;
    element.style.touchAction = 'none';

    element.addEventListener('pointerdown', (e) => {
        if (!state.isEditMode || e.target.closest('button') || e.target.tagName === 'INPUT' || e.target.classList.contains('fa-expand')) return;
        isDragging = true;
        element.setPointerCapture(e.pointerId);
        startX = e.clientX - element.getBoundingClientRect().left;
        startY = e.clientY - element.getBoundingClientRect().top;
        element.style.zIndex = 1000;
        e.stopPropagation();
    });

    document.addEventListener('pointermove', (e) => {
        if (!isDragging || !state.isEditMode) return;
        const canvas = document.getElementById('floor-canvas');
        const rect = canvas.getBoundingClientRect();
        
        let newX = Math.max(5, Math.min(e.clientX - rect.left - startX, canvas.clientWidth - width - 10));
        let newY = Math.max(5, Math.min(e.clientY - rect.top - startY, canvas.clientHeight - height - 10));

        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
    });

    document.addEventListener('pointerup', async () => {
        if (isDragging) {
            isDragging = false;
            element.style.zIndex = 20;
            const newX = parseInt(element.style.left) || 0;
            const newY = parseInt(element.style.top) || 0;

            const tableObj = state.tables.find(t => t.id === tableId);
            if (tableObj) {
                tableObj.pos_x = newX;
                tableObj.pos_y = newY;
                if (state.supabaseClient) {
                    await state.supabaseClient.from('tables').update({ pos_x: newX, pos_y: newY }).eq('id', tableId);
                }
            }
        }
    });
}

function enableTableResize(handleEl, tableEl, tableId) {
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    handleEl.style.touchAction = 'none';

    handleEl.addEventListener('pointerdown', (e) => {
        isResizing = true;
        handleEl.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        startWidth = tableEl.offsetWidth;
        startHeight = tableEl.offsetHeight;
        e.stopPropagation();
    });

    document.addEventListener('pointermove', (e) => {
        if (!isResizing) return;
        tableEl.style.width = `${Math.max(50, startWidth + (e.clientX - startX))}px`;
        tableEl.style.height = `${Math.max(50, startHeight + (e.clientY - startY))}px`;
    });

    document.addEventListener('pointerup', async () => {
        if (isResizing) {
            isResizing = false;
            const finalWidth = tableEl.offsetWidth;
            const finalHeight = tableEl.offsetHeight;

            const tableObj = state.tables.find(t => t.id === tableId);
            if (tableObj) {
                tableObj.width = finalWidth;
                tableObj.height = finalHeight;
                if (state.supabaseClient) {
                    await state.supabaseClient.from('tables').update({ width: finalWidth, height: finalHeight }).eq('id', tableId);
                }
            }
        }
    });
}

async function rotateTableAction(tableId, callback) {
    const tableObj = state.tables.find(t => t.id === tableId);
    if (!tableObj) return;
    tableObj.rotation = ((tableObj.rotation || 0) + 90) % 360;
    renderTables(callback);
    if (state.supabaseClient) {
        await state.supabaseClient.from('tables').update({ rotation: tableObj.rotation }).eq('id', tableId);
    }
}

async function updateTableSeatsAction(tableId, newSeats) {
    const seatsNum = parseInt(newSeats) || 1;
    const tableObj = state.tables.find(t => t.id === tableId);
    if (tableObj) {
        tableObj.seats = seatsNum;
        if (state.supabaseClient) {
            await state.supabaseClient.from('tables').update({ seats: seatsNum }).eq('id', tableId);
        }
    }
}

async function deleteTableAction(tableId) {
    if (!state.supabaseClient) return;
    if (!confirm("Vuoi davvero eliminare questo tavolo?")) return;
    await state.supabaseClient.from('bookings').delete().eq('table_id', tableId);
    await state.supabaseClient.from('tables').delete().eq('id', tableId);
    document.getElementById('booking-modal').classList.add('hidden');
    // Ricaricamento gestito da app.js
}
