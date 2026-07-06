async function verificarSesion() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        const userInfo = document.getElementById('user-info');
        const buttons = document.getElementById('buttons');
        const logoutSection = document.getElementById('logout-section');

        if (data.success) {
            userInfo.innerHTML = '<p>Bienvenido, <strong>' + escapeHtml(data.usuario.nombre) + '</strong></p>';
            userInfo.className = 'home-user';
            buttons.style.display = 'flex';
            logoutSection.style.display = 'block';
            const btnAdmin = document.getElementById('btn-admin');
            const btnAbast = document.getElementById('btn-abastecimiento');
            if (data.usuario.rol && data.usuario.rol.toLowerCase() === 'administrador') {
                btnAdmin.style.display = 'flex';
                if (btnAbast) btnAbast.style.display = 'flex';
            }
        } else {
            userInfo.innerHTML = '<p>Redirigiendo al login...</p>';
            setTimeout(() => { window.location.href = '/login'; }, 1000);
        }
    } catch (error) {
        const userInfo = document.getElementById('user-info');
        userInfo.innerHTML = '<p>Redirigiendo al login...</p>';
        setTimeout(() => { window.location.href = '/login'; }, 1000);
    }
}

function cerrarSesion() {
    fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(() => { window.location.href = '/login'; })
        .catch(() => { window.location.href = '/login'; });
}

verificarSesion();
