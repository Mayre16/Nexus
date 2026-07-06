const form = document.getElementById('password-form');
const btnSubmit = document.getElementById('btn-submit');
const errorDiv = document.getElementById('error-message');
const successDiv = document.getElementById('success-message');

function showError(msg) {
    successDiv.classList.remove('show');
    errorDiv.textContent = msg;
    errorDiv.classList.add('show');
    setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

function showSuccess(msg) {
    errorDiv.classList.remove('show');
    successDiv.textContent = msg;
    successDiv.classList.add('show');
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const actual = document.getElementById('password-actual').value;
    const nueva = document.getElementById('password-nueva').value;
    const confirmar = document.getElementById('password-confirmar').value;

    if (!actual || !nueva || !confirmar) { showError('Todos los campos son requeridos'); return; }
    if (nueva !== confirmar) { showError('Las contraseñas nuevas no coinciden'); return; }
    if (nueva.length < 6) { showError('La contraseña debe tener al menos 6 caracteres'); return; }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Guardando...';

    try {
        const res = await fetch('/api/auth/cambiar-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ password_actual: actual, password_nueva: nueva, password_confirmar: confirmar })
        });
        const data = await res.json();

        if (data.success) {
            showSuccess('Contraseña actualizada. Redirigiendo...');
            setTimeout(() => { window.location.href = '/'; }, 1500);
        } else {
            showError(data.error || 'Error al cambiar la contraseña');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Cambiar Contraseña';
        }
    } catch (err) {
        showError('Error de conexión. Intenta nuevamente.');
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Cambiar Contraseña';
    }
});
