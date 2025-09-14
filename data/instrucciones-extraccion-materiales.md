# Instrucciones para Extraer Materiales de un Rectángulo por Título

Esta guía permite extraer sistemáticamente todos los materiales de cualquier tablero identificado por su título en el dibujo DWG parseado.

## Paso 1: Buscar el texto del título

```bash
jq '.entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("TITULO"; "i"))) | map({text: .text, position: .startPoint, handle: .handle})' completo.json
```

**Nota:** Reemplazar "TITULO" con el texto buscado (ej: "ts1a/n", "ts1b/e")

## Paso 2: Encontrar el rectángulo principal

```bash
jq --argjson refX COORD_X --argjson refY COORD_Y '.entities | map(select(.type == "LWPOLYLINE" and (.vertices | length) == 4)) | map(select( (.vertices[0].x - $refX | if . < 0 then -. else . end) < 3000 and (.vertices[0].y - $refY | if . < 0 then -. else . end) < 3000 )) | map({ handle: .handle, firstVertex: .vertices[0], bounds: { minX: ([.vertices[].x] | min), maxX: ([.vertices[].x] | max), minY: ([.vertices[].y] | min), maxY: ([.vertices[].y] | max) } })' completo.json
```

**Nota:** Reemplazar COORD_X y COORD_Y con las coordenadas del título encontrado

## Paso 3: Extraer todas las entidades del rectángulo

```bash
jq --argjson minX MIN_X --argjson maxX MAX_X --argjson minY MIN_Y --argjson maxY MAX_Y '
{
  "rectangle_bounds": {
    "minX": $minX, "maxX": $maxX, "minY": $minY, "maxY": $maxY,
    "description": "TITULO rectangle content"
  },
  "entities": [.entities[] | select(
    ((.startPoint.x // .center.x // .insertionPoint.x // (.vertices[0].x // 0)) >= $minX and
     (.startPoint.x // .center.x // .insertionPoint.x // (.vertices[0].x // 0)) <= $maxX and
     (.startPoint.y // .center.y // .insertionPoint.y // (.vertices[0].y // 0)) >= $minY and
     (.startPoint.y // .center.y // .insertionPoint.y // (.vertices[0].y // 0)) <= $maxY)
  )]
}' completo.json > extract_TITULO.json
```

## Paso 4: Extraer especificaciones de materiales

### 4.1 Extraer amperajes de térmicas y diferenciales

```bash
jq '.entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("[0-9]+x[0-9]+A"))) | map({text: .text, position: .startPoint}) | sort_by(.text)' extract_TITULO.json
```

### 4.2 Extraer IDs de diferenciales

```bash
jq '.entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("ID[0-9]+|IDSI[0-9]+"))) | map({text: .text, position: .startPoint}) | sort_by(.text)' extract_TITULO.json
```

### 4.3 Extraer circuitos

```bash
jq '.entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("TS[0-9]+[A-Z]+-[A-Z]+[0-9]*"))) | map({text: .text, position: .startPoint}) | sort_by(.text)' extract_TITULO.json
```

### 4.4 Extraer todos los textos

```bash
jq '.entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map({text: .text, position: .startPoint})' extract_TITULO.json
```

## Paso 5: Análisis de materiales

### 5.1 Contar térmicas por amperaje

**Mapeo de especificaciones:**
- `2x10A` → TÉRMICA 2P10A 4.5KA C
- `2x16A` → TÉRMICA 2P16A 4.5KA C  
- `2x25A` → TÉRMICA 2P25A 4.5KA C
- `4x40A` → TÉRMICA 4P40A 4.5KA C
- `4x80A` → TÉRMICA 4P80A 4.5KA C

### 5.2 Contar diferenciales

**Mapeo de especificaciones:**
- `ID` + `2x40A 30mA` → DIFERENCIAL 2P40A 30mA
- `IDSI` + `4x40A 30mA` → DIFERENCIAL 4P40A 30mA

### 5.3 Identificar equipos especiales

**Buscar textos clave:**
- "UPS" → Equipos UPS
- "SECCIONADOR" → Seccionadores
- "GABINETE" → Gabinetes
- "DESCARGADOR" → Descargadores de sobretensión

---

## Ejemplo completo: TS1B/E

### Comandos ejecutados paso a paso

```bash
# 1. Buscar título
jq '.entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(select(.text | test("ts1b.*e"; "i")))' completo.json

# 2. Encontrar rectángulo  
jq --argjson refX 92603.28 --argjson refY 2654.31 '.entities | map(select(.type == "LWPOLYLINE" and (.vertices | length) == 4)) | map(select( (.vertices[0].x - $refX | if . < 0 then -. else . end) < 3000 and (.vertices[0].y - $refY | if . < 0 then -. else . end) < 3000 ))' completo.json

# 3. Extraer entidades
jq --argjson minX 92589.76 --argjson maxX 95911.66 --argjson minY 1337.53 --argjson maxY 2609.46 '{entities: [.entities[] | select(((.startPoint.x // .center.x // .insertionPoint.x // (.vertices[0].x // 0)) >= $minX and (.startPoint.x // .center.x // .insertionPoint.x // (.vertices[0].x // 0)) <= $maxX and (.startPoint.y // .center.y // .insertionPoint.y // (.vertices[0].y // 0)) >= $minY and (.startPoint.y // .center.y // .insertionPoint.y // (.vertices[0].y // 0)) <= $maxY))]}' completo.json > extract_ts1be.json

# 4. Analizar materiales por amperaje
jq '.entities | map(select(.type == "TEXT")) | map(.text) | map(select(test("[0-9]+x[0-9]+A"))) | group_by(.) | map({amperage: .[0], count: length})' extract_ts1be.json
```

### Resultado TS1B/E

**Materiales identificados:**
- 1 SECCIONADOR MANUAL BAJO CARGA 4P50A
- 5 DIFERENCIALES (3x 2P40A 30mA + 2x diversos)
- 9 TÉRMICAS 2P10A 4.5KA C (circuitos iluminación + emergencia)
- 1 TÉRMICA 2P40A 4.5KA C (barra emergencia)
- 1 TÉRMICA 4P40A 4.5KA C (barra emergencia trifásica)
- 2 UPS 8kVA
- 1 GABINETE ESTANCO IP65
- Cable LSOH 4x16mm² + PE

---

## Comandos de verificación útiles

### Contar entidades por tipo
```bash
jq '.entities | map(.type) | group_by(.) | map({type: .[0], count: length})' extract_TITULO.json
```

### Contar total de entidades
```bash
jq '.entities | length' extract_TITULO.json
```

### Buscar texto específico
```bash
jq '.entities | map(select(.type == "TEXT" and (.text | contains("PALABRA_CLAVE"))))' extract_TITULO.json
```

### Exportar solo textos a archivo separado
```bash
jq '.entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map(.text)' extract_TITULO.json > textos_TITULO.json
```

---

Esta metodología permite extraer sistemáticamente todos los materiales de cualquier tablero identificado por su título en el dibujo DWG parseado, proporcionando una lista completa de materiales para compra e instalación.