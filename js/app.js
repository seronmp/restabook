// --- INIZIO SUPER-PATCH ADMIN (FORZA BRUTA) ---
setTimeout(async () => {
    const supabaseUrl = 'https://wqnqhmozprrxrcssesoq.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbnFobW96cHJyeHJjc3Nlc29xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NTQyNzUsImV4cCI6MjEwNTIzMDI3NX0.fDZyZXt0z6NjkDRj9sM5jIdHnoZY5vOHkDQp4h95GMY';
    
    let sbClient;
    if (typeof window.supabase !== 'undefined') {
        sbClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        // 1. SE SEI GIÀ LOGGATO, SALTA IL LOGIN E MOSTRA L'APP
        const { data } = await sbClient.auth.getSession();
        if (data && data.session) {
            document.getElementById('login-container').style.display = 'none';
            // Corretto in 'block' per mantenere l'impaginazione verticale di Tailwind
            document.getElementById('app-container').style.display = 'block'; 
            creaBottoniAdmin();
        }
    

        document.getElementById('btn-create-restaurant').addEventListener('click', () => {
            alert("Hai cliccato Nuovo Ristorante! Cerco di aprire register.html...");
            window.location.href = 'register.html'; // Assicurati che questo file esista su GitHub!
        });

        document.getElementById('btn-logout').addEventListener('click', async () => {
            alert("Hai cliccato Esci! Sto pulendo la memoria e disconnettendo Supabase...");
            if (sbClient) {
                await sbClient.auth.signOut();
            } else if (typeof window.supabase !== 'undefined') {
                // Se sbClient si è "perso", usa l'oggetto globale per fare il logout
                const tempClient = window.supabase.createClient(supabaseUrl, supabaseKey);
                await tempClient.auth.signOut();
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = window.location.pathname; 
        });
    }
}
