// TRUCCO: Genera i pulsanti Superadmin automaticamente in alto
setTimeout(() => {
    const adminMenu = document.createElement('div');
    adminMenu.style.position = 'fixed';
    adminMenu.style.top = '12px';
    // Aumentato da 200px a 350px per spostarli più a sinistra e non coprire IT/DE
    adminMenu.style.right = '350px'; 
    adminMenu.style.zIndex = '9999';
    adminMenu.style.display = 'flex';
    adminMenu.style.gap = '10px';

    // Colori rimossi: impostato background trasparente, testo scuro e un bordo grigio
    adminMenu.innerHTML = `
        <button id="btn-create-restaurant" style="background-color: transparent; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer;">+ Nuovo Ristorante</button>
        <button id="btn-logout" style="background-color: transparent; color: #333; border: 1px solid #ccc; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer;">Esci</button>
    `;

    document.body.appendChild(adminMenu);

    document.getElementById('btn-create-restaurant').addEventListener('click', () => {
        window.location.href = 'register.html';
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
        if (typeof window.supabase !== 'undefined') {
            await window.supabase.auth.signOut();
        }
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';
    });
}, 1500);
