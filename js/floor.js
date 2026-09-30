async function loadData() {
    if (!state.supabaseClient) {
        console.warn("Client Supabase non ancora inizializzato.");
        return;
    }
    
    const restId = state.currentRestaurantId || localStorage.getItem('currentRestaurantId');
    if (!restId || restId === 'undefined') {
        console.log("Nessun ristorante selezionato al momento.");
        return;
    }

    // Svuotiamo le stanze per evitare sovrapposizioni tra ristoranti
    state.rooms = [];
    state.currentRoomId = null;

    try {
        // IL FIX È QUI: Interroghiamo la tabella restaurants SOLO se non siamo nella dashboard globale
        if (restId !== 'tutti') {
            const { data, error } = await state.supabaseClient
                .from('restaurants')
                .select('rooms_config')
                .eq('restaurant_id', restId)
                .single();
                
            if (error && error.code !== 'PGRST116') {
                console.error("Errore caricamento Supabase (rooms_config):", error.message);
            } else if (data && data.rooms_config && data.rooms_config.length > 0) {
                state.rooms = typeof data.rooms_config === 'string' ? JSON.parse(data.rooms_config) : data.rooms_config;
            } else {
                const savedRooms = localStorage.getItem('restabook_rooms_' + restId) || localStorage.getItem('rooms_' + restId);
                if (savedRooms) {
                    try {
                        state.rooms = JSON.parse(savedRooms);
                        if (state.rooms.length > 0 && typeof window.saveRoomsToLocal === 'function') {
                            setTimeout(() => window.saveRoomsToLocal(), 500);
                        }
                    } catch (e) {
                        console.error("Errore parsing stanze locali:", e);
                    }
                } else {
                    state.rooms = [{ id: 'sala-principale', name: 'Sala Principale', walls: [] }];
                }
            }
        } else {
            // Se siamo nella Dashboard Globale, usiamo una sala virtuale vuota senza interrogare il DB
            state.rooms = [{ id: 'sala-globale', name: 'Vista Globale', walls: [] }];
        }

        if (state.rooms.length > 0) {
            state.currentRoomId = state.rooms[0].id;
        }

        let queryTables = state.supabaseClient.from('tables').select('*');
        let queryBookings = state.supabaseClient.from('bookings').select('*');

        if (state.currentRestaurantId !== 'tutti') {
            if (state.currentRestaurantName && state.currentRestaurantName !== 'Admin Globale') {
                queryTables = queryTables.or(`restaurant_id.eq.${state.currentRestaurantId},restaurant_name.eq.${state.currentRestaurantName},restaurant_id.eq.${state.currentRestaurantName}`);
                queryBookings = queryBookings.or(`restaurant_id.eq.${state.currentRestaurantId},restaurant_id.eq.${state.currentRestaurantName}`);
            } else {
                queryTables = queryTables.eq('restaurant_id', state.currentRestaurantId);
                queryBookings = queryBookings.eq('restaurant_id', state.currentRestaurantId);
            }
        }

        const { data: tablesData, error: tablesError } = await queryTables;
        if (tablesError) throw tablesError;

        state.tables = (tablesData || []).map(t => ({
            id: t.id,
            table_number: t.table_number,
            seats: t.seats,
            shape: t.shape,
            pos_x: t.pos_x ?? 50,
            pos_y: t.pos_y ?? 50,
            width: t.width ?? (t.seats <= 2 ? 70 : t.seats <= 4 ? 90 : t.seats <= 8 ? 120 : 150),
            height: t.height ?? (t.seats <= 8 ? 90 : 100),
            rotation: t.rotation ?? 0,
            room_id: t.room_id || 'sala-principale',
            restaurant_id: t.restaurant_id
        }));

        const { data: bookingsData, error: bookingsError } = await queryBookings;
        if (bookingsError) throw bookingsError;

        state.bookings = (bookingsData || []).map(b => ({
            id: b.id,
            tableId: b.table_id,
            date: b.date,
            startTime: b.start_time ? b.start_time.substring(0, 5) : '',
            endTime: b.end_time ? b.end_time.substring(0, 8) : '',
            name: b.name,
            guests: b.guests,
            phone: b.phone
        }));

        refreshUI();
    } catch (err) {
        console.error("Errore caricamento Supabase:", err.message);
    }
}
