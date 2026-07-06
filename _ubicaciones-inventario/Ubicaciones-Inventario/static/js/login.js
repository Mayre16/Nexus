const loginForm = document.getElementById('login-form');
const btnLogin = document.getElementById('btn-login');
const errorDiv = document.getElementById('error-message');

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    setTimeout(() => { errorDiv.classList.remove('show'); }, 5000);
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) { showError('Por favor completa todos los campos'); return; }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Iniciando sesión...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (data.success) {
            const mustChange = data.usuario.must_change_password === true;
            if (window.FEATURE_MUST_CHANGE_PASSWORD && mustChange) {
                window.location.href = '/cambiar-password';
                return;
            }
            window.location.href = '/';
        } else {
            showError(data.error || 'Error al iniciar sesión');
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar Sesión';
        }
    } catch (error) {
        showError('Error de conexión. Intenta nuevamente.');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar Sesión';
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();
        if (data.success) {
            const mustChange = data.usuario.must_change_password === true;
            if (window.FEATURE_MUST_CHANGE_PASSWORD && mustChange) {
                window.location.href = '/cambiar-password';
                return;
            }
            window.location.href = '/';
        }
    } catch (error) { /* No session */ }
});
