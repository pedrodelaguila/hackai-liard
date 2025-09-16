# Estructura del JSON de DWG Parseado

## Archivos Analizados
- `completo.json` (347MB) - Archivo principal con toda la estructura del DWG
- `Parsed entities.json` (37KB) - Archivo menor con entidades específicas

## Estructura Principal (completo.json)

El archivo JSON tiene 4 secciones principales:

```json
{
  "entities": {...},    // 353,850 entidades gráficas
  "header": {...},      // Variables de configuración del dibujo  
  "objects": {...},     // 2 objetos (IMAGEDEF, LAYOUT)
  "tables": {...}       // 6 tablas de definición
}
```

---

## 1. HEADER
Contiene 182 variables de configuración del dibujo AutoCAD:

### Variables Principales
- `ACADMAINTVER`, `VERSIONGUID`, `FINGERPRINTGUID` - Versión y identificación
- `EXTMIN`, `EXTMAX` - Límites del dibujo (coordenadas mínimas y máximas)
- `INSBASE`, `INSUNITS` - Base de inserción y unidades
- `LTSCALE`, `TEXTSIZE` - Escalas de línea y texto
- `CLAYER`, `CECOLOR`, `CELTYPE` - Capa, color y tipo de línea actuales
- Variables DIM* - Configuración de dimensiones (DIMSCALE, DIMTXT, etc.)
- Variables UCS* - Sistema de coordenadas de usuario

### Estructura de acceso
```bash
# Listar todas las variables del header
jq '.header | keys' completo.json

# Obtener valor específico
jq '.header.EXTMIN' completo.json
jq '.header.EXTMAX' completo.json
```

---

## 2. TABLES
6 tablas de definición con sus entradas:

### Estructura de Tables
```json
{
  "BLOCK_RECORD": {
    "entries": { ... }    // 1,302 registros de bloques
  },
  "DIMSTYLE": {
    "entries": { ... }    // Estilos de dimensión
  },
  "LAYER": {
    "entries": { ... }    // 72 capas
  },
  "LTYPE": {
    "entries": { ... }    // Tipos de línea
  },
  "STYLE": {
    "entries": { ... }    // Estilos de texto
  },
  "VPORT": {
    "entries": { ... }    // Viewports
  }
}
```

### Consultas Útiles
```bash
# Contar capas
jq '.tables.LAYER.entries | keys | length' completo.json

# Listar todas las capas
jq '.tables.LAYER.entries | keys' completo.json

# Contar bloques definidos
jq '.tables.BLOCK_RECORD.entries | keys | length' completo.json

# Ver definición de una capa específica
jq '.tables.LAYER.entries["0"]' completo.json
```

---

## 3. ENTITIES
353,850 entidades gráficas indexadas numéricamente (0 a 353,849)

### Tipos de Entidades (16 tipos)
- `ARC` - Arcos
- `CIRCLE` - Círculos  
- `DIMENSION` - Dimensiones/acotaciones
- `ELLIPSE` - Elipses
- `HATCH` - Rellenos/tramas
- `INSERT` - Inserciones de bloques
- `LEADER` - Líneas de referencia
- `LINE` - Líneas
- `LWPOLYLINE` - Polilíneas ligeras
- `MTEXT` - Texto multilínea
- `OLE2FRAME` - Objetos OLE
- `POINT` - Puntos
- `POLYLINE` - Polilíneas
- `SOLID` - Sólidos 2D
- `SPLINE` - Curvas spline
- `TEXT` - Texto simple

### Propiedades Comunes de Entidades
Todas las entidades tienen estas propiedades base:
```json
{
  "type": "TIPO_ENTIDAD",
  "handle": "ID_UNICO",
  "ownerBlockRecordSoftId": "ID_BLOQUE_PADRE", 
  "layer": "NOMBRE_CAPA",
  "color": 0,
  "colorIndex": 256,
  "colorName": "",
  "lineType": "",
  "lineweight": 29,
  "lineTypeScale": 1,
  "isVisible": true,
  "transparency": 0,
  "extrusionDirection": { "x": 0, "y": 0, "z": 1 }
}
```

### Propiedades Específicas por Tipo

#### LINE
```json
{
  "startPoint": { "x": 56644.55, "y": 15586.24, "z": 0 },
  "endPoint": { "x": 56645.05, "y": 15585.74, "z": 0 }
}
```

#### CIRCLE
```json
{
  "center": { "x": 56050.31, "y": 15242.24, "z": 0 },
  "radius": 7.999999999999886
}
```

#### TEXT
```json
{
  "text": "%%UVISTA CON PUERTAS",
  "thickness": 0,
  "startPoint": { "x": 56667.20, "y": 15717.80 },
  "endPoint": { "x": 56870.63, "y": 15717.80 },
  "textHeight": 33.6,
  "rotation": 0,
  "xScale": 0.8,
  "obliqueAngle": 0,
  "styleName": "ROMANS",
  "generationFlag": 0,
  "halign": 1,
  "valign": 0
}
```

#### INSERT (Bloques)
```json
{
  "name": "*U18",
  "insertionPoint": { "x": 35481.97, "y": 12010.07, "z": -5.14e-18 },
  "xScale": 1,
  "yScale": 1, 
  "zScale": 1,
  "rotation": 0,
  "columnCount": 0,
  "rowCount": 0,
  "columnSpacing": 0,
  "rowSpacing": 0
}
```

### Consultas de Entidades
```bash
# Contar entidades por tipo
jq '.entities | map(.type) | group_by(.) | map({type: .[0], count: length})' completo.json

# Obtener todas las entidades de un tipo específico
jq '.entities | map(select(.type == "LINE"))' completo.json

# Filtrar entidades por capa
jq '.entities | map(select(.layer == "BASE"))' completo.json

# Buscar entidades en un área específica (ejemplo para líneas)
jq '.entities | map(select(.type == "LINE" and .startPoint.x > 50000 and .startPoint.x < 60000))' completo.json

# Obtener todos los nombres de bloques únicos
jq '.entities | map(select(.type == "INSERT")) | map(.name) | unique' completo.json

# Contar inserciones por bloque
jq '.entities | map(select(.type == "INSERT")) | group_by(.name) | map({name: .[0].name, count: length}) | sort_by(.count) | reverse' completo.json
```

---

## 4. OBJECTS
2 tipos de objetos:

### IMAGEDEF
Definiciones de imágenes insertadas en el dibujo

### LAYOUT
Configuración de layouts/presentaciones

### Consultas de Objetos
```bash
# Ver todos los tipos de objetos
jq '.objects | keys' completo.json

# Explorar contenido de objetos
jq '.objects.IMAGEDEF' completo.json
jq '.objects.LAYOUT' completo.json
```

---

## Consultas Útiles por Caso de Uso

### Análisis Geométrico
```bash
# Encontrar límites del dibujo
jq '.header.EXTMIN, .header.EXTMAX' completo.json

# Obtener todas las coordenadas de líneas
jq '.entities | map(select(.type == "LINE")) | map(.startPoint, .endPoint)' completo.json

# Calcular longitudes de líneas (requiere post-procesamiento)
jq '.entities | map(select(.type == "LINE")) | map({start: .startPoint, end: .endPoint, handle: .handle})' completo.json
```

### Análisis de Capas
```bash
# Entidades por capa
jq '.entities | group_by(.layer) | map({layer: .[0].layer, count: length}) | sort_by(.count) | reverse' completo.json

# Tipos de entidades en una capa específica
jq '.entities | map(select(.layer == "BASE")) | map(.type) | unique' completo.json
```

### Análisis de Bloques
```bash
# Todos los bloques insertados con sus posiciones
jq '.entities | map(select(.type == "INSERT")) | map({name: .name, position: (.insertionPoint // .startPoint // .center), rotation: .rotation})' completo.json

# Bloques más utilizados
jq '.entities | map(select(.type == "INSERT")) | group_by(.name) | map({name: .[0].name, count: length}) | sort_by(.count) | reverse | .[0:10]' completo.json
```

### Análisis de Texto
```bash
# Todos los textos del dibujo
jq '.entities | map(select(.type == "TEXT" or .type == "MTEXT")) | map({text: .text, layer: .layer, position: (.startPoint // .insertionPoint // .center)})' completo.json

# Buscar texto específico
jq '.entities | map(select(.type == "TEXT" and (.text | contains("VISTA"))))' completo.json
```

---

## Estructura del Archivo Parsed entities.json

Archivo más pequeño con estructura similar pero solo con entidades específicas:

```bash
# Explorar estructura
jq 'keys' "Parsed entities.json"

# Ver contenido de cada clave principal  
jq '.* | keys' "Parsed entities.json"
```

Este archivo parece contener bloques específicos identificados por nombres como "*U10", "*U100", etc., probablemente componentes eléctricos o elementos específicos del dibujo técnico.

---

## Comandos JQ de Referencia Rápida

```bash
# Estructura general
jq 'keys' completo.json
jq '. | keys' completo.json

# Contar elementos  
jq '.entities | length' completo.json
jq '.tables.LAYER.entries | length' completo.json

# Filtros básicos
jq '.entities[0]' completo.json
jq '.entities[0] | keys' completo.json

# Mapeo y filtrado
jq '.entities | map(.type) | unique' completo.json
jq '.entities | map(select(.type == "LINE"))' completo.json

# Agrupación y conteo
jq '.entities | group_by(.type) | map({type: .[0], count: length})' completo.json
```