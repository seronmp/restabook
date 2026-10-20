import { state } from './config.js';

export async function initAuth(onSuccess) {
    if (window.supabase) {
        state.supabaseClient = window.supabase.createClient(
            'https://wqnqhmozprrxrcssesoq.supabase.co', 
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnFobW96cHJyeHJjc3Nlc29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTQyNzUsImV4cCI6MjEwNTIzMDI3NX0.fDZyZXt0z6NjkDRj9sM5jIdHnoZY5vOHkDQp4h95GMY'
        );
        
        const { data: { session } } = await state.supabaseClient.auth.getSession();
        if (session) {
            await gestisciAccessoRiuscito(session.user, onSuccess);
        }
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const { data: authData, error: authError } = await state.supabaseClient.auth.signInWithPassword({
            email, password
        });

        if (authError) {
            alert("Errore di login: " + authError.message);
            return;
        }

        await gestisciAccessoRiuscito(authData.user, onSuccess);
    });
}

async function gestisciAccessoRiuscito(user, onSuccess) {
    state.isAdmin = user.email === 'admin@admin.com';
    if (state.isAdmin) {
        state.currentRestaurantId = 'tutti';
        state.currentRestaurantName = 'Admin Globale';
    } else {
        const { data: profile, error } = await state.supabaseClient
            .from('profiles')
            .select('restaurant_id, restaurant_name')
            .eq('id', user.id)
            .single();

        const restaurantId = profile?.restaurant_id;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(restaurantId || ''));
        if (error || !profile || !isUuid) {
            state.currentRestaurantId = null;
            state.currentRestaurantName = '';
            alert('Für dieses Konto ist kein gültiges Restaurantprofil hinterlegt. Bitte die Restaurant-Zuordnung in Supabase korrigieren lassen.');
            return;
        }

        state.currentRestaurantId = restaurantId;
        state.currentRestaurantName = profile.restaurant_name || '';
    }

    document.getElementById('login-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('app-title').innerText = state.currentRestaurantName;
    if (onSuccess) onSuccess();
}
