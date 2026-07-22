#!/usr/bin/env python3
"""
Script para crear documento Word con información técnica del AccuSine PCS+
"""

from docx import Document
from docx.shared import Inches, Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def set_cell_shading(cell, fill_color):
    """Aplica color de fondo a una celda"""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shading = OxmlElement('w:shd')
    shading.set(qn('w:fill'), fill_color)
    tcPr.append(shading)

def create_document():
    doc = Document()
    
    # Configurar márgenes
    sections = doc.sections
    for section in sections:
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)
    
    # =====================================================
    # PORTADA
    # =====================================================
    doc.add_paragraph()
    doc.add_paragraph()
    
    title = doc.add_paragraph()
    title_run = title.add_run("INFORMACIÓN TÉCNICA")
    title_run.bold = True
    title_run.font.size = Pt(28)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    subtitle = doc.add_paragraph()
    subtitle_run = subtitle.add_run("PowerLogic AccuSine PCS+")
    subtitle_run.bold = True
    subtitle_run.font.size = Pt(24)
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    subtitle2 = doc.add_paragraph()
    subtitle2_run = subtitle2.add_run("Filtro Activo de Armónicos")
    subtitle2_run.font.size = Pt(18)
    subtitle2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    doc.add_paragraph()
    doc.add_paragraph()
    
    models = doc.add_paragraph()
    models_run = models.add_run("Modelos a Cotizar:")
    models_run.bold = True
    models_run.font.size = Pt(16)
    models.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    model1 = doc.add_paragraph()
    model1_run = model1.add_run("• PCSP120D5IP00 (PCS 120A)")
    model1_run.font.size = Pt(14)
    model1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    model2 = doc.add_paragraph()
    model2_run = model2.add_run("• PCSP200D5IP54 (PCS 200A IP54)")
    model2_run.font.size = Pt(14)
    model2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    doc.add_paragraph()
    doc.add_paragraph()
    doc.add_paragraph()
    
    brand = doc.add_paragraph()
    brand_run = brand.add_run("Schneider Electric")
    brand_run.bold = True
    brand_run.font.size = Pt(16)
    brand.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    doc.add_page_break()
    
    # =====================================================
    # ÍNDICE
    # =====================================================
    doc.add_heading("ÍNDICE", level=1)
    
    toc_items = [
        "1. Introducción al Sistema AccuSine PCS+",
        "2. Especificaciones Técnicas Generales",
        "3. Modelo PCSP120D5IP00 (120A)",
        "4. Modelo PCSP200D5IP54 (200A IP54)",
        "5. Generación de Calor y Disipación Térmica",
        "6. Especificaciones de Espacio e Instalación",
        "7. Características y Mejoras al Sistema",
        "8. Normativas y Certificaciones"
    ]
    
    for item in toc_items:
        p = doc.add_paragraph(item)
        p.paragraph_format.left_indent = Cm(1)
    
    doc.add_page_break()
    
    # =====================================================
    # SECCIÓN 1: INTRODUCCIÓN
    # =====================================================
    doc.add_heading("1. Introducción al Sistema AccuSine PCS+", level=1)
    
    intro_text = """El PowerLogic AccuSine PCS+ es un filtro activo de armónicos (AHF) diseñado para estabilizar redes eléctricas industriales mediante la inyección dinámica de corriente en tiempo real. Este sistema proporciona:

• Mitigación de armónicos
• Corrección del factor de potencia
• Balanceo de carga

El AccuSine PCS+ inyecta corriente armónica complementaria para cancelar los armónicos en el sistema de distribución eléctrica, lo que resulta en una mayor confiabilidad de la red eléctrica y reducción de costos operativos."""
    
    doc.add_paragraph(intro_text)
    
    doc.add_heading("Principio de Operación", level=2)
    
    operation_text = """El filtro activo AccuSine PCS+ funciona inyectando corriente armónica opuesta en el lado de la fuente de la carga. Esto cancela efectivamente las corrientes armónicas generadas por cargas no lineales, como variadores de frecuencia, UPS, equipos de soldadura y otros dispositivos electrónicos de potencia.

El sistema monitorea continuamente la corriente de línea mediante transformadores de corriente (CTs) y calcula en tiempo real la compensación necesaria para cada armónico individual hasta el orden 51."""
    
    doc.add_paragraph(operation_text)
    
    doc.add_page_break()
    
    # =====================================================
    # SECCIÓN 2: ESPECIFICACIONES TÉCNICAS GENERALES
    # =====================================================
    doc.add_heading("2. Especificaciones Técnicas Generales", level=1)
    
    doc.add_heading("Características Eléctricas Comunes", level=2)
    
    # Tabla de especificaciones generales
    table = doc.add_table(rows=12, cols=2)
    table.style = 'Table Grid'
    
    specs = [
        ("Parámetro", "Especificación"),
        ("Voltaje de Red", "380-480 V AC"),
        ("Frecuencia", "50/60 Hz ±3 Hz (autodetección)"),
        ("Conexión", "Trifásica 3 hilos o 4 hilos"),
        ("THDi de Salida", "≤ 3%"),
        ("Corrección de Armónicos", "Hasta el 51° armónico"),
        ("Tiempo de Respuesta (Armónicos)", "2 ciclos"),
        ("Tiempo de Respuesta (Factor de Potencia)", "1/4 ciclo"),
        ("Factor de Potencia Objetivo", "Configurable (leading o lagging)"),
        ("Capacidad de Paralelismo", "Hasta 10 unidades (máx. 3000A por juego de CT)"),
        ("Ubicación de Instalación", "Interior únicamente"),
        ("Grado de Contaminación", "2 (sin partículas conductivas)")
    ]
    
    for i, (param, spec) in enumerate(specs):
        row = table.rows[i]
        row.cells[0].text = param
        row.cells[1].text = spec
        if i == 0:
            set_cell_shading(row.cells[0], "003366")
            set_cell_shading(row.cells[1], "003366")
            row.cells[0].paragraphs[0].runs[0].font.color.rgb = None
            row.cells[1].paragraphs[0].runs[0].font.color.rgb = None
            row.cells[0].paragraphs[0].runs[0].bold = True
            row.cells[1].paragraphs[0].runs[0].bold = True
    
    doc.add_paragraph()
    
    doc.add_page_break()
    
    # =====================================================
    # SECCIÓN 3: MODELO PCS120
    # =====================================================
    doc.add_heading("3. Modelo PCSP120D5IP00 (120A)", level=1)
    
    doc.add_heading("Descripción General", level=2)
    
    pcs120_desc = """Este modelo es un filtro activo de armónicos con una corriente nominal de salida de 120 Amperios. La designación IP00 indica que es un chasis sin protección de ingreso, diseñado para montaje en pared y entrada de cables por la parte inferior."""
    
    doc.add_paragraph(pcs120_desc)
    
    doc.add_heading("Especificaciones del Modelo PCSP120D5IP00", level=2)
    
    # Tabla PCS120
    table120 = doc.add_table(rows=14, cols=2)
    table120.style = 'Table Grid'
    
    specs120 = [
        ("Característica", "Valor"),
        ("Referencia", "PCSP120D5IP00"),
        ("Corriente Nominal de Salida (RMS)", "120 A"),
        ("Potencia Reactiva", "100 kVAR @ 480V"),
        ("Rango de Voltaje", "380-480 V AC"),
        ("Frecuencia", "50/60 Hz ±3 Hz"),
        ("Grado de Protección", "IP00 (chasis abierto)"),
        ("Montaje", "Pared"),
        ("Entrada de Cables", "Inferior"),
        ("Dimensiones (A x An x P)", "1400 x 426 x 384 mm (55.1 x 16.8 x 15.1 in)"),
        ("Peso", "113 kg (249 lbs)"),
        ("Disipación de Calor", "2.0 - 2.2 kW @ 380-480V"),
        ("Temperatura de Operación", "0°C a 45°C (32°F a 113°F)"),
        ("Ventilación", "Plenum trasero con ventilación forzada")
    ]
    
    for i, (param, spec) in enumerate(specs120):
        row = table120.rows[i]
        row.cells[0].text = param
        row.cells[1].text = spec
        if i == 0:
            set_cell_shading(row.cells[0], "003366")
            set_cell_shading(row.cells[1], "003366")
            row.cells[0].paragraphs[0].runs[0].bold = True
            row.cells[1].paragraphs[0].runs[0].bold = True
    
    doc.add_paragraph()
    
    doc.add_heading("Conexiones Eléctricas", level=2)
    
    connections120 = """• Terminales de potencia: Espárragos M8
• Terminales de tierra: Espárragos M8
• Separación entre espárragos: 25.4 mm (1 in) centro a centro
• Temperatura de cable permitida: 75°C, 90°C
• Par de apriete: 18.2 N·m (161.1 lb-in)"""
    
    doc.add_paragraph(connections120)
    
    doc.add_page_break()
    
    # =====================================================
    # SECCIÓN 4: MODELO PCS200 IP54
    # =====================================================
    doc.add_heading("4. Modelo PCSP200D5IP54 (200A IP54)", level=1)
    
    doc.add_heading("Descripción General", level=2)
    
    pcs200_desc = """Este modelo es un filtro activo de armónicos con una corriente nominal de salida de 200 Amperios. La designación IP54 indica protección contra polvo limitada y protección contra salpicaduras de agua desde cualquier dirección. Es un gabinete de piso diseñado para aplicaciones industriales pesadas y entornos de misión crítica."""
    
    doc.add_paragraph(pcs200_desc)
    
    doc.add_heading("Especificaciones del Modelo PCSP200D5IP54", level=2)
    
    # Tabla PCS200
    table200 = doc.add_table(rows=15, cols=2)
    table200.style = 'Table Grid'
    
    specs200 = [
        ("Característica", "Valor"),
        ("Referencia", "PCSP200D5IP54"),
        ("Corriente Nominal de Salida (RMS)", "200 A"),
        ("Potencia Reactiva", "166 kVAR @ 480V"),
        ("Rango de Voltaje", "380-480 V AC"),
        ("Frecuencia", "50/60 Hz ±3 Hz"),
        ("Grado de Protección", "IP54"),
        ("Montaje", "Piso (floor standing)"),
        ("Entrada de Cables", "Superior o Inferior"),
        ("Dimensiones (A x An x P)", "2100 x 900 x 600 mm (82.7 x 35.4 x 23.6 in)"),
        ("Peso", "402 kg (886 lbs)"),
        ("Disipación de Calor", "3.9 - 4.3 kW @ 380-480V"),
        ("Temperatura de Operación", "0°C a 40°C (32°F a 104°F)"),
        ("Color del Gabinete", "RAL7035 Gris Claro"),
        ("Certificaciones", "CE, UL, IBC 2015 AC156, EAC, RCM")
    ]
    
    for i, (param, spec) in enumerate(specs200):
        row = table200.rows[i]
        row.cells[0].text = param
        row.cells[1].text = spec
        if i == 0:
            set_cell_shading(row.cells[0], "003366")
            set_cell_shading(row.cells[1], "003366")
            row.cells[0].paragraphs[0].runs[0].bold = True
            row.cells[1].paragraphs[0].runs[0].bold = True
    
    doc.add_paragraph()
    
    doc.add_heading("Conexiones Eléctricas", level=2)
    
    connections200 = """• Terminales de potencia: Espárragos M12
• Terminales de tierra: Espárragos M8
• Separación entre espárragos: 44.5 mm (1.75 in) centro a centro
• Temperatura de cable permitida: 75°C, 90°C
• Par de apriete potencia: 37.0 N·m (327.5 lb-in)
• Par de apriete tierra: 18.2 N·m (161.1 lb-in)"""
    
    doc.add_paragraph(connections200)
    
    doc.add_page_break()
    
    # =====================================================
    # SECCIÓN 5: GENERACIÓN DE CALOR
    # =====================================================
    doc.add_heading("5. Generación de Calor y Disipación Térmica", level=1)
    
    heat_intro = """El filtro activo genera calor significativo durante su operación. Es fundamental consultar las especificaciones de pérdidas de potencia para cada modelo y asegurar una ventilación adecuada en el área de instalación."""
    
    doc.add_paragraph(heat_intro)
    
    doc.add_heading("Carga Térmica por Modelo", level=2)
    
    # Tabla de calor
    heat_table = doc.add_table(rows=5, cols=4)
    heat_table.style = 'Table Grid'
    
    heat_data = [
        ("Modelo", "Carga Térmica (kW)", "Flujo de Aire Requerido", "Disipación de Potencia"),
        ("60 A", "0.95 - 1.1 kW", "370 m³/h (217.7 CFM)", "1.04 kW"),
        ("120 A (PCS120)", "2.0 - 2.2 kW", "830 m³/h (488.3 CFM)", "2.48 kW"),
        ("200 A (PCS200)", "3.9 - 4.3 kW", "1900 m³/h (1117.8 CFM)", "4.92 kW"),
        ("300 A", "5.9 - 6.6 kW", "1900 m³/h (1117.8 CFM)", "6.54 kW")
    ]
    
    for i, row_data in enumerate(heat_data):
        row = heat_table.rows[i]
        for j, cell_data in enumerate(row_data):
            row.cells[j].text = cell_data
        if i == 0:
            for cell in row.cells:
                set_cell_shading(cell, "003366")
                cell.paragraphs[0].runs[0].bold = True
    
    doc.add_paragraph()
    
    doc.add_heading("Requisitos de Ventilación", level=2)
    
    ventilation = """Para asegurar una operación óptima y prolongar la vida útil del equipo:

• Temperatura ambiente recomendada: 20°C - 30°C (68°F - 86°F)
• Temperatura máxima de operación: 40°C - 45°C según modelo
• Humedad relativa máxima: 95% (sin condensación)
• Punto de rocío máximo: 37°C (98.6°F)
• Tipo de ventilación: Plenum trasero con ventilación forzada (modelos chasis)
• Aire de entrada: Limpio, libre de partículas conductivas

IMPORTANTE: Las unidades IP00/chasis tienen un plenum trasero con ventilación forzada para alto flujo de calor. El aire de entrada debe estar limpio y libre de partículas conductivas."""
    
    doc.add_paragraph(ventilation)
    
    doc.add_heading("Consideraciones de Diseño del Sistema de Enfriamiento", level=2)
    
    cooling = """• El sistema de aire acondicionado del cuarto debe ser capaz de remover la carga térmica total
• Mantener flujo de aire sin obstrucciones hacia la parte frontal e inferior del equipo
• No bloquear las rejillas de ventilación
• Considerar la carga térmica combinada si se instalan múltiples unidades en paralelo"""
    
    doc.add_paragraph(cooling)
    
    doc.add_page_break()
    
    # =====================================================
    # SECCIÓN 6: ESPECIFICACIONES DE ESPACIO E INSTALACIÓN
    # =====================================================
    doc.add_heading("6. Especificaciones de Espacio e Instalación", level=1)
    
    doc.add_heading("Dimensiones Comparativas", level=2)
    
    # Tabla de dimensiones
    dim_table = doc.add_table(rows=3, cols=5)
    dim_table.style = 'Table Grid'
    
    dim_data = [
        ("Modelo", "Alto mm (in)", "Ancho mm (in)", "Profundidad mm (in)", "Peso kg (lbs)"),
        ("PCSP120D5IP00", "1400 (55.1)", "426 (16.8)", "384 (15.1)", "113 (249)"),
        ("PCSP200D5IP54", "2100 (82.7)", "900 (35.4)", "600 (23.6)", "402 (886)")
    ]
    
    for i, row_data in enumerate(dim_data):
        row = dim_table.rows[i]
        for j, cell_data in enumerate(row_data):
            row.cells[j].text = cell_data
        if i == 0:
            for cell in row.cells:
                set_cell_shading(cell, "003366")
                cell.paragraphs[0].runs[0].bold = True
    
    doc.add_paragraph()
    
    doc.add_heading("Requisitos de Espacio para Instalación", level=2)
    
    space_req = """Modelo PCSP120D5IP00 (Montaje en Pared):
• Espacio frontal mínimo: 800 mm para acceso de servicio
• Espacio trasero: Asegurar flujo de aire adecuado al plenum
• Altura de montaje: Considerar acceso a HMI y terminales
• Soporte de pared: Debe soportar 113 kg mínimo

Modelo PCSP200D5IP54 (Montaje en Piso):
• Espacio frontal mínimo: 900 mm para apertura de puertas y servicio
• Espacio lateral: Mínimo 100 mm para ventilación
• Espacio trasero: Mínimo 100 mm para circulación de aire
• Piso: Superficie nivelada capaz de soportar 402 kg
• Fijación: Anclaje al piso mediante los puntos provistos"""
    
    doc.add_paragraph(space_req)
    
    doc.add_heading("Requisitos de Instalación Eléctrica", level=2)
    
    electrical = """Protección de Sobrecorriente:

| Modelo | Ampacidad Mínima | Fusible/Breaker Mínimo | Fusible/Breaker Máximo |
|--------|------------------|------------------------|------------------------|
| 120 A  | 120 A            | 150 A                  | 150-160 A              |
| 200 A  | 200 A            | 250 A                  | 250 A                  |

Cableado de Potencia:
• Los cables deben ser dimensionados al 125% de la corriente nominal del filtro
• Usar conductores de cobre con aislamiento para 75°C o 90°C
• Instalar en conduit metálico o cables encapsulados blindados
• El conduit metálico debe conectarse a tierra en el equipo

Dispositivo de Corriente Residual (RCD/GFCI):
• Se recomienda dispositivo de mínimo 500 mA debido a alta corriente de fuga
• Si se requiere menos de 500 mA, abrir los interruptores IT/BP"""
    
    doc.add_paragraph(electrical)
    
    doc.add_page_break()
    
    # =====================================================
    # SECCIÓN 7: CARACTERÍSTICAS Y MEJORAS AL SISTEMA
    # =====================================================
    doc.add_heading("7. Características y Mejoras al Sistema", level=1)
    
    doc.add_heading("Beneficios de la Implementación", level=2)
    
    benefits = """Mejoras en la Calidad de Energía:
• Reducción de THDi a ≤3% (cumplimiento IEEE 519)
• Corrección del factor de potencia (leading o lagging configurable)
• Balanceo de corrientes de fase
• Reducción de fluctuaciones de voltaje relacionadas con procesos

Mejoras en la Confiabilidad del Sistema:
• Eliminación de disparos por sobrecalentamiento en dispositivos de protección
• Reducción del sobrecalentamiento en cables, interruptores y transformadores
• Mayor vida útil de motores y equipos
• Reducción de interferencia electromagnética (EMI)

Mejoras Operativas:
• Liberación de capacidad del sistema de distribución
• Reducción de pérdidas en líneas por corrientes armónicas
• Eliminación de penalizaciones por bajo factor de potencia
• Reducción de profundidad de caídas de voltaje por inrush de corriente"""
    
    doc.add_paragraph(benefits)
    
    doc.add_heading("Características Técnicas Avanzadas", level=2)
    
    features = """• Inyección dinámica de corriente en tiempo real
• Compensación de armónicos hasta el orden 51
• Respuesta a fluctuaciones de carga en 2 ciclos (armónicos)
• Respuesta a cambios de factor de potencia en 1/4 de ciclo
• Capacidad de compensación VAR (adelanto o atraso)
• Operación en paralelo de hasta 10 unidades
• Pantalla HMI táctil a color
• Comunicación Modbus TCP/IP y Modbus Serial
• Entradas/salidas digitales configurables
• Contactos secos programables
• Compatibilidad con EcoStruxure Power para monitoreo y análisis"""
    
    doc.add_paragraph(features)
    
    doc.add_heading("Modos de Operación", level=2)
    
    modes = """El AccuSine PCS+ puede operar en los siguientes modos:

1. Cancelación de Armónicos: Inyecta corriente armónica opuesta para neutralizar armónicos del sistema

2. Corrección del Factor de Potencia: Inyecta corriente reactiva para ajustar el factor de potencia al valor objetivo

3. Balanceo de Carga: Equilibra las corrientes entre las tres fases para reducir corrientes de neutro y pérdidas

4. Modo Combinado: Operación simultánea de las funciones anteriores con priorización configurable"""
    
    doc.add_paragraph(modes)
    
    doc.add_heading("Ventajas sobre Soluciones Convencionales", level=2)
    
    advantages = """Comparado con filtros pasivos y otras soluciones tradicionales:

• No hay riesgo de resonancia con el sistema
• Adaptación automática a cambios en la carga
• Menor espacio requerido
• No requiere estudios complejos de armónicos para el dimensionamiento
• Fácil expansión mediante unidades adicionales en paralelo
• Mantenimiento reducido (sin capacitores o inductores que reemplazar periódicamente)
• Respuesta dinámica superior
• Compatible con generadores sin riesgo de autoexcitación"""
    
    doc.add_paragraph(advantages)
    
    doc.add_page_break()
    
    # =====================================================
    # SECCIÓN 8: NORMATIVAS Y CERTIFICACIONES
    # =====================================================
    doc.add_heading("8. Normativas y Certificaciones", level=1)
    
    doc.add_heading("Cumplimiento de Estándares", level=2)
    
    standards = """El AccuSine PCS+ está diseñado y certificado según las siguientes normas:

Normas de Diseño:
• IEC 62477-1 (Requisitos de seguridad para sistemas de conversión de potencia)
• IEC 61000-6-2 (Inmunidad EMC para entornos industriales)
• IEC 61000-6-4 (Emisiones EMC para entornos industriales)
• IEC 61439-1 (Conjuntos de aparamenta de baja tensión)
• UL 508 (Equipos de control industrial)

Estándares de Calidad de Energía:
• IEEE 519-2014 (Prácticas recomendadas para control de armónicos)
• IEC 61000-3-4 (Límites de emisión de corrientes armónicas)
• UK G5/4-1 (Estándar del Reino Unido para conexión de cargas generadoras de armónicos)

Certificaciones del Producto:
• CE (Conformidad Europea)
• UL (Underwriters Laboratories)
• IBC 2015 AC156 (Código sísmico internacional de construcción)
• EAC (Certificación Euroasiática)
• RCM (Marca de Cumplimiento Regulatorio - Australia)"""
    
    doc.add_paragraph(standards)
    
    doc.add_heading("Condiciones Ambientales de Operación", level=2)
    
    env_table = doc.add_table(rows=6, cols=3)
    env_table.style = 'Table Grid'
    
    env_data = [
        ("Parámetro", "PCSP120D5IP00", "PCSP200D5IP54"),
        ("Temperatura de Operación", "0°C a 45°C", "0°C a 40°C"),
        ("Temperatura Óptima", "20°C a 30°C", "20°C a 30°C"),
        ("Humedad Relativa Máxima", "95% (sin condensación)", "95% (sin condensación)"),
        ("Punto de Rocío Máximo", "37°C", "37°C"),
        ("Altitud Máxima", "1000m (derateo por encima)", "1000m (derateo por encima)")
    ]
    
    for i, row_data in enumerate(env_data):
        row = env_table.rows[i]
        for j, cell_data in enumerate(row_data):
            row.cells[j].text = cell_data
        if i == 0:
            for cell in row.cells:
                set_cell_shading(cell, "003366")
                cell.paragraphs[0].runs[0].bold = True
    
    doc.add_paragraph()
    
    # Nota final
    doc.add_paragraph()
    note = doc.add_paragraph()
    note_run = note.add_run("NOTA: ")
    note_run.bold = True
    note.add_run("Las especificaciones están sujetas a cambios sin previo aviso. Consulte la documentación oficial de Schneider Electric para información actualizada. Este documento es de referencia y no sustituye los manuales de instalación y operación del fabricante.")
    
    # Guardar documento
    doc.save('/workspace/AccuSine_PCS_Informacion_Tecnica.docx')
    print("Documento creado exitosamente: AccuSine_PCS_Informacion_Tecnica.docx")

if __name__ == "__main__":
    create_document()
