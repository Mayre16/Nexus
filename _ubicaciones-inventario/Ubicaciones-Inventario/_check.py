import requests

s = requests.Session()
r = s.post('http://localhost:5000/api/auth/login', json={'email': 'admin@wms.local', 'password': 'admin123'})
print('Login:', r.json().get('success'))

pages = {
    '/login': ['login-form', 'btn-login'],
    '/': ['buttons', 'btn-admin'],
    '/despachos': ['despachos-tbody', 'despachos-cards', 'pagination-controls'],
    '/recepciones': ['recepciones-tbody', 'recepciones-cards', 'pagination-controls'],
    '/transferencias': ['transferencias-tbody', 'transferencias-cards', 'pagination-controls'],
    '/ajustes': ['ajustes-tbody', 'ajustes-cards', 'pagination-controls', 'modal-descargar-catalogo', 'modal-carga-masiva'],
    '/despacho': ['search-factura-form', 'tipo-factura', 'docid-input', 'factura-info', 'productos-grid', 'empty-state'],
    '/recepcion': ['search-recepcion-form', 'tipo-recepcion', 'docid-input'],
    '/transferencia': ['search-transferencia-form'],
    '/ajustes/nuevo': ['ajuste-form'],
    '/ajustes/detalle': ['ajuste-info'],
    '/productos': ['busqueda-input', 'producto-info'],
    '/admin': ['tabla-ubicaciones', 'tabla-usuarios'],
    '/cambiar-password': ['password-form', 'btn-submit'],
}

all_ok = True
for url, required_ids in pages.items():
    try:
        r = s.get('http://localhost:5000' + url)
        html = r.text
        missing = []
        for eid in required_ids:
            marker = 'id="' + eid + '"'
            if marker not in html:
                missing.append(eid)
        if missing:
            print('MISSING in ' + url + ': ' + ', '.join(missing))
            all_ok = False
        else:
            print('OK ' + url)
    except Exception as e:
        print('ERROR ' + url + ': ' + str(e))
        all_ok = False

if all_ok:
    print('\nAll pages validated successfully!')
else:
    print('\nSome pages have issues.')
