// #target photoshop

// UltimateDesignExtractor.jsx — 1080×1080 Canvas Edition (Portrait)
// Senior Developer Version: High-Precision Design Extraction Engine
// Target: Photoshop CC+
// Optimized for: Mobile App Rendering Fidelity
// Canvas: Fixed 1080×1080 px — layers outside this area are clipped away
// STATUS: Reference / Most Perfect Script — all other scripts derived from this


function unitDoubleToPx(obj, key, docRes) {
    var tid = stringIDToTypeID(key);
    var v = obj.getUnitDoubleValue(tid);
    var u = obj.getUnitDoubleType(tid);

    // Pixels => return as-is
    if (u === charIDToTypeID("#Pxl") || typeIDToStringID(u) === "pixelsUnit") return v;

    // Points => convert using resolution
    if (u === charIDToTypeID("#Pnt") || typeIDToStringID(u) === "pointsUnit") return v * (docRes / 72);

    // Fallback: assume pixels
    return v;
}

var CONFIG = {
    FONT_BASE_URL: "http://143.198.235.152:8080/fonts/",
    PREFERRED_FONT_EXTENSION: "ttf",
    FONT_EXTENSIONS: [".ttf", ".otf"],
    EXPORT_PRECISION: 2,
    JPEG_QUALITY: 7,
    DEFAULT_CANVAS_BG: null,
    RUNE_AUTO_LEADING: 1.2,
    // Hybrid feature support:
    // - preserve editability where feasible (text, simple shapes)
    // - rasterize complex PS-only features for fidelity (filters, complex FX, masks)
    FEATURE_SUPPORT_MODE: "hybrid", // "hybrid" | "editable" | "fidelity"
    // If true, bake blend-mode runs into a single PNG chunk and skip the
    // individual layers in that run (for renderers without blend mode support).
    BAKE_BLEND_CHUNKS: false,
    // Mask handling:
    // - For fidelity, keep masks/clipping enabled during export and rasterize when needed.
    // - Set these to true only if you explicitly want to ignore masks/clipping.
    IGNORE_LAYER_MASKS: false,
    IGNORE_CLIPPING_MASKS: false,     // Set to true to completely ignore clipping logic
    BAKE_CLIPPING_MASKS: false,       // If false, shape and clipped image are exported separately
    // - "text": keep as type "text" (editable: color/font/etc)
    // - "raster": export text as PNG (reliable display, not editable)
    // - "skip": ignore text layers
    TEXT_LAYER_MODE: "text",
    // Automatically flag images/assets as editable if they look like placeholders or brand assets
    AUTO_EDITABLE_IMAGES: true,
    // If true, keep shapes as vector/editable even if they have some complex effects
    FORCE_SHAPE_EDITABILITY: true,
    // Safe Bounds Clipping:
    // If true, any layer whose exported bounds exceed the canvas by more than SAFE_BOUNDS_MARGIN
    // will be clipped back to the visible canvas area and flagged with boundsWarning.
    // This fixes issues like Smart Object icons being exported with w:6882 on a 1080px canvas.
    SAFE_BOUNDS_CLIPPING: true,
    SAFE_BOUNDS_MARGIN: 2.0,  // allow up to 2x canvas size outside canvas before clipping
    // Tighter margin for icon/contact-role Smart Objects (phone, pin icons etc.)
    // They are typically tiny but their SO canvas inflates reported bounds massively.
    SAFE_BOUNDS_MARGIN_ICON: 1.0,
    // If true, every non-decorative image layer gets userReplaceable:true so your
    // mobile app can show a "Change Image" button for those layers (car, logo, etc.).
    USER_REPLACEABLE_IMAGES: true,
    // Layer name prefix to force a clean transparent PNG export even if the layer
    // has complex effects or blend modes (like Color Burn) that usually cause baking.
    FORCE_TRANSPARENCY_PREFIX: "[trans]",
    BRAND_COLORS: {}
};

var RUN_ERRORS = [];
var LAYER_ID_MAP = {};
var SEP = ($.os.toLowerCase().indexOf("windows") !== -1) ? "\\" : "/";

// ─── Photoshop / Windows Default Font Map ────────────────────────────────────
// IMPORTANT: This MUST be at the top of the file (before main() is called)
// so that buildGoogleFontUrl() can access it during export.
// Maps LOWERCASE font family name → Google Fonts family string OR null:
//   string → generate a Google Fonts CSS2 URL
//   null   → system/Adobe/custom font, use server TTF/OTF fallback
// ─────────────────────────────────────────────────────────────────────────────
var PHOTOSHOP_FONT_MAP = {
    // ── Fonts from the Photoshop font-picker screenshot ───────────────────
    "poppins": "Poppins",
    "dvbttraghavenbold": null,
    "source serif variable": "Source Serif 4",
    "source serif 4": "Source Serif 4",
    "rog fonts": null,
    "onyx": null,
    "engravers mt": null,
    "gill sans ultra bold": null,
    "goudy stout": null,
    "impact": null,
    "emojione": null,
    "segoe ui emoji": null,
    "acumin variable concept": null,
    "agency fb": null,
    "algerian": null,
    "arial": null,
    "arial rounded mt bold": null,
    "bahnschrift": null,
    "baskerville old face": null,
    "bauhaus 93": null,
    "bell mt": null,
    "berlin sans fb": null,
    "berlin sans fb demi": null,
    "bernard mt condensed": null,
    "blackadder itc": null,
    "bodoni mt": null,
    "book antiqua": null,
    "bookman old style": null,
    "bookshelf symbol 7": null,
    "bradley hand itc": null,
    "britannic bold": null,
    "broadway": null,
    "brush script mt": null,
    "calibri": null,
    "californian fb": null,
    "calisto mt": null,
    "cambria": null,
    "cambria math": null,
    "candara": null,
    "cascadia code": null,
    "cascadia mono": null,
    "castellar": null,
    "centaur": null,
    "century": null,
    "century gothic": null,
    "century schoolbook": null,
    "chiller": null,
    "colonna mt": null,
    "comic sans ms": null,
    "consolas": null,
    // ── More Windows system fonts ─────────────────────────────────────────
    "arial black": null,
    "courier new": null,
    "georgia": null,
    "tahoma": null,
    "times new roman": null,
    "trebuchet ms": null,
    "verdana": null,
    "wingdings": null,
    "webdings": null,
    "segoe ui": null,
    "segoe print": null,
    "segoe script": null,
    "franklin gothic medium": null,
    "garamond": null,
    "haettenschweiler": null,
    "lucida console": null,
    "lucida handwriting": null,
    "lucida sans": null,
    "lucida sans unicode": null,
    "microsoft sans serif": null,
    "ms gothic": null,
    "ms mincho": null,
    "palatino linotype": null,
    "sylfaen": null,
    "symbol": null,
    "terminal": null,
    "marlett": null,
    "modern no. 20": null,
    "monotype corsiva": null,
    "ms reference sans serif": null,
    "ms reference specialty": null,
    "old english text mt": null,
    "perpetua": null,
    "playbill": null,
    "poor richard": null,
    "ravie": null,
    "rockwell": null,
    "rockwell extra bold": null,
    "script mt bold": null,
    "showcard gothic": null,
    "snap itc": null,
    "stencil": null,
    "tw cen mt": null,
    "tw cen mt condensed": null,
    "tw cen mt condensed extra bold": null,
    "viner hand itc": null,
    "vivaldi": null,
    "vladimir script": null,
    "wide latin": null,
    // ── Adobe / Photoshop bundled fonts ──────────────────────────────────
    "myriad pro": null,
    "myriad pro condensed": null,
    "myriad pro light": null,
    "adobe garamond pro": null,
    "adobe caslon pro": null,
    "trajan pro": null,
    "trajan pro 3": null,
    "minion pro": null,
    "source code pro": "Source Code Pro",
    "source sans pro": "Source Sans Pro",
    "source sans 3": "Source Sans 3",
    "source serif pro": "Source Serif 4",
    "adobe hebrew": null,
    "adobe devanagari": null,
    "adobe arabic": null,
    "adobe thai": null,
    "birch std": null,
    "blackoak std": null,
    "chaparral pro": null,
    "charlemagne std": null,
    "cooper std": null,
    "gill sans std": null,
    "hypatia sans pro": null,
    "juniper std": null,
    "kozuka gothic pro": null,
    "lithos pro": null,
    "mesquite std": null,
    "nueva std": null,
    "ocr a std": null,
    "orator std": null,
    "poplar std": null,
    "prestige elite std": null,
    "rosewood std": null,
    "tekton pro": null,
    "utopia std": null,
    "warnock pro": null,
    // ── Google Fonts ─────────────────────────────────────────────────────
    "roboto": "Roboto",
    "roboto mono": "Roboto Mono",
    "roboto condensed": "Roboto Condensed",
    "roboto slab": "Roboto Slab",
    "open sans": "Open Sans",
    "lato": "Lato",
    "montserrat": "Montserrat",
    "oswald": "Oswald",
    "raleway": "Raleway",
    "nunito": "Nunito",
    "nunito sans": "Nunito Sans",
    "playfair display": "Playfair Display",
    "ubuntu": "Ubuntu",
    "merriweather": "Merriweather",
    "pt sans": "PT Sans",
    "pt serif": "PT Serif",
    "noto sans": "Noto Sans",
    "noto serif": "Noto Serif",
    "inter": "Inter",
    "work sans": "Work Sans",
    "mulish": "Mulish",
    "fira sans": "Fira Sans",
    "fira code": "Fira Code",
    "dm sans": "DM Sans",
    "dm serif display": "DM Serif Display",
    "josefin sans": "Josefin Sans",
    "josefin slab": "Josefin Slab",
    "quicksand": "Quicksand",
    "titillium web": "Titillium Web",
    "exo 2": "Exo 2",
    "exo": "Exo",
    "cabin": "Cabin",
    "karla": "Karla",
    "dosis": "Dosis",
    "arimo": "Arimo",
    "tinos": "Tinos",
    "ubuntu mono": "Ubuntu Mono",
    "inconsolata": "Inconsolata",
    "space mono": "Space Mono",
    "space grotesk": "Space Grotesk",
    "libre baskerville": "Libre Baskerville",
    "libre franklin": "Libre Franklin",
    "eb garamond": "EB Garamond",
    "cormorant garamond": "Cormorant Garamond",
    "crimson text": "Crimson Text",
    "lora": "Lora",
    "zilla slab": "Zilla Slab",
    "cardo": "Cardo",
    "spectral": "Spectral",
    "bodoni moda": "Bodoni Moda",
    "abril fatface": "Abril Fatface",
    "pacifico": "Pacifico",
    "dancing script": "Dancing Script",
    "satisfy": "Satisfy",
    "caveat": "Caveat",
    "kaushan script": "Kaushan Script",
    "permanent marker": "Permanent Marker",
    "lobster": "Lobster",
    "righteous": "Righteous",
    "russo one": "Russo One",
    "bree serif": "Bree Serif",
    "ubuntu condensed": "Ubuntu Condensed",
    "yanone kaffeesatz": "Yanone Kaffeesatz",
    "barlow": "Barlow",
    "barlow condensed": "Barlow Condensed",
    "barlow semi condensed": "Barlow Semi Condensed",
    "heebo": "Heebo",
    "outfit": "Outfit",
    "manrope": "Manrope",
    "red hat display": "Red Hat Display",
    "red hat text": "Red Hat Text",
    "ibm plex sans": "IBM Plex Sans",
    "ibm plex mono": "IBM Plex Mono",
    "ibm plex serif": "IBM Plex Serif",
    "be vietnam pro": "Be Vietnam Pro",
    "plus jakarta sans": "Plus Jakarta Sans",
    "syne": "Syne",
    "epilogue": "Epilogue",
    "jost": "Jost",
    "urbanist": "Urbanist",
    "lexend": "Lexend",
    // ── Indic / regional Google Fonts ─────────────────────────────────────
    "noto sans devanagari": "Noto Sans Devanagari",
    "noto sans gujarati": "Noto Sans Gujarati",
    "noto sans tamil": "Noto Sans Tamil",
    "noto sans telugu": "Noto Sans Telugu",
    "noto sans bengali": "Noto Sans Bengali",
    "hind": "Hind",
    "hind siliguri": "Hind Siliguri",
    "hind vadodara": "Hind Vadodara",
    "hind madurai": "Hind Madurai",
    "hind guntur": "Hind Guntur",
    "mukta": "Mukta",
    "tiro devanagari hindi": "Tiro Devanagari Hindi",
    "baloo 2": "Baloo 2",
    "baloo bhai 2": "Baloo Bhai 2",
    "martel": "Martel",
    "rozha one": "Rozha One",
    "yatra one": "Yatra One",
    "rasa": "Rasa",
    "conthrax": null
};

function isoDate(d) {
    function pad(n) { return (n < 10 ? "0" + n : n); }
    if (!d) d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" +
        pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "Z";
}

// ─── Safe Bounds Guard ───────────────────────────────────────────────────────
// Detects layers with extreme off-canvas positions (common with Smart Objects
// that have a large internal canvas, or effects like Drop Shadow applied to
// a tiny icon that dramatically inflates the reported bounds).
// When SAFE_BOUNDS_CLIPPING is true, clips the x/y/w/h back to the visible
// canvas area and sets item.boundsWarning so downstream renderers can log it.
function safeguardLayerBounds(item, canvasW, canvasH) {
    if (!CONFIG.SAFE_BOUNDS_CLIPPING) return item;

    // Use a tighter clipping margin for contact/icon roles (phone-call, location-pin).
    // These Smart Objects often have a canvas 6x the icon size; cap them at 1x canvas.
    var role = item.role || "content";
    var isIconRole = (role === "contact");

    // FIX 4: Non-icon layers should only be clipped when bounds are TRULY pathological
    // (e.g. Smart Object internal canvas of 6882px on a 1080px canvas).
    // Designer-stretched masks that go 10-50% outside the canvas must NOT be clipped
    // or the mobile renderer will receive wrong positions/sizes.
    // Rule: clip non-icon layers only when a dimension exceeds 4x the canvas.
    var margin = isIconRole
        ? (typeof CONFIG.SAFE_BOUNDS_MARGIN_ICON === "number" ? CONFIG.SAFE_BOUNDS_MARGIN_ICON : 1.0)
        : 4.0;   // was CONFIG.SAFE_BOUNDS_MARGIN (2.0) — raised to 4x to allow intentional bleed

    var threshold = Math.max(canvasW, canvasH) * margin;

    var x = item.x, y = item.y, w = item.w, h = item.h;

    var tooFarLeft = (x < -threshold);
    var tooFarTop = (y < -threshold);
    var tooFarRight = ((x + w) > canvasW + threshold);
    var tooFarBottom = ((y + h) > canvasH + threshold);
    var oversized = (w > canvasW * margin || h > canvasH * margin);

    if (!tooFarLeft && !tooFarTop && !tooFarRight && !tooFarBottom && !oversized) return item;

    // Record original bounds for debugging
    item.boundsWarning = {
        reason: "extreme_bounds_clipped",
        original: { x: x, y: y, w: w, h: h },
        note: "Layer bounds were far outside the canvas. Clipped to visible area."
    };

    // For icon roles: clamp to canvas. For others: allow 50% bleed on each side.
    var bleed = isIconRole ? 0 : 0.5;
    var clippedX = Math.max(-canvasW * bleed, Math.min(x, canvasW));
    var clippedY = Math.max(-canvasH * bleed, Math.min(y, canvasH));
    var clippedR = Math.min((x + w), canvasW * (1 + bleed));
    var clippedB = Math.min((y + h), canvasH * (1 + bleed));
    var clippedW = Math.max(0, clippedR - clippedX);
    var clippedH = Math.max(0, clippedB - clippedY);

    item.x = formatDecimal(clippedX);
    item.y = formatDecimal(clippedY);
    item.w = formatDecimal(clippedW);
    item.h = formatDecimal(clippedH);

    if (isIconRole && (item.w >= canvasW || item.h >= canvasH)) {
        item.forceAlphaTightening = true;
    }

    return item;
}

// ─── Canvas Bounds Clamping ──────────────────────────────────────────────────
// Strictly clips every layer's x/y/w/h to the VISIBLE canvas rectangle
// [0, 0] → [canvasW, canvasH].
//
// Why this is needed:
//   Designers often place or stretch layers beyond the artboard in Photoshop
//   (e.g. a background image that starts at y=-609 and is 1744px tall on a
//   1080px canvas). The mobile renderer must only see the visible portion —
//   the same region shown inside the artboard guides.
//
// How it works (for each axis independently):
//   visibleStart = max(layerStart, 0)          ← clip leading bleed
//   visibleEnd   = min(layerEnd,   canvasSize) ← clip trailing bleed
//   visibleSize  = max(0, visibleEnd - visibleStart)
//
// Examples:
//   layer { x:0,  y:-609, w:1090, h:1744 } on 1080×1080 canvas
//     → clipped to { x:0, y:0, w:1080, h:1080 }
//
//   layer { x:-50, y:200, w:300, h:100 } on 1080×1080 canvas
//     → clipped to { x:0, y:200, w:250, h:100 }
//
//   layer { x:1000, y:0, w:200, h:200 } on 1080×1080 canvas
//     → clipped to { x:1000, y:0, w:80, h:200 }
//
//   layer fully outside → w or h becomes 0 → skipped by empty-layer guard
// ─────────────────────────────────────────────────────────────────────────────
function clampBoundsToCanvas(item, canvasW, canvasH) {
    var x = item.x, y = item.y, w = item.w, h = item.h;

    // Visible X range
    var visX1 = Math.max(x, 0);
    var visX2 = Math.min(x + w, canvasW);
    var visW = Math.max(0, visX2 - visX1);

    // Visible Y range
    var visY1 = Math.max(y, 0);
    var visY2 = Math.min(y + h, canvasH);
    var visH = Math.max(0, visY2 - visY1);

    item.x = formatDecimal(visX1);
    item.y = formatDecimal(visY1);
    item.w = formatDecimal(visW);
    item.h = formatDecimal(visH);

    return item;
}
// ─────────────────────────────────────────────────────────────────────────────

// Allow wrapper scripts (like backend/server.js) to include this file without auto-running.
// If `dontRunMain` is not set, behave like a standalone script.
if (typeof dontRunMain === "undefined" || dontRunMain !== true) {
    main();
}

function main() {
    var originalRulerUnits = app.preferences.rulerUnits;
    var originalDisplayDialogs = app.displayDialogs;
    app.preferences.rulerUnits = Units.PIXELS;
    app.displayDialogs = DialogModes.NO;

    var outFolder = null;
    var batchTimestamp = new Date().getTime();

    // Guard: Check if documents are open
    if (!app.documents || app.documents.length === 0) {
        alert("No documents are open. Please open a PSD first.");
        return;
    }

    // Reset error accumulation for new run
    RUN_ERRORS = [];

    try {
        outFolder = getOutFolder();
        if (!outFolder.exists) outFolder.create();

        var allTemplates = [];
        var docsToProcess = [];

        // UI Prompt: Choose export scope
        if (app.documents.length > 1) {
            var mode = confirm("Multiple documents detected.\n\nClick YES to export ALL (" + app.documents.length + ") open designs.\nClick NO to export only the '" + app.activeDocument.name + "'.");
            if (mode) {
                for (var d0 = 0; d0 < app.documents.length; d0++) docsToProcess.push(app.documents[d0]);
            } else {
                docsToProcess.push(app.activeDocument);
            }
        } else {
            docsToProcess.push(app.activeDocument);
        }

        for (var i = 0; i < docsToProcess.length; i++) {
            var doc = docsToProcess[i];
            app.activeDocument = doc;

            // Use the PSD filename as the template ID base for better multi-design management
            var designName = doc.name.replace(/\.[^\.]+$/, "").replace(/[^a-z0-9]/gi, "_").toLowerCase();

            var result = processDocument(doc, outFolder, batchTimestamp, designName);
            if (result) allTemplates.push(result);

            // Generate Human-Readable Design Audit (Reverse Tracking)
            try {
                generateFidelityAudit(doc, outFolder, designName);
            } catch (eAudit) {
                pushRunError("audit_failed", { message: eAudit.message, design: designName });
            }

            try { $.gc(); } catch (eGC) { }
        }

        saveFinalJson(allTemplates, outFolder, batchTimestamp);
        writeRunErrorReportIfAny(outFolder, batchTimestamp);
        var zipResult = createExportZip(outFolder, batchTimestamp);
        var zipMsg = zipResult
            ? "\n\nZIP archive created:\n" + zipResult
            : "\n\n(ZIP creation failed — check PowerShell execution policy)";
        alert("Success! Professional Export completed.\n\n" +
            "1. Designs Exported: " + allTemplates.length + "\n" +
            "2. Output Folder: " + outFolder.fsName + "\n" +
            "3. Reverse Trackers: See 'DESIGN_AUDIT_<name>.txt' for each design's construction recipe." + zipMsg);

    } catch (err) {
        pushRunError("fatal", {
            message: err && err.message ? err.message : String(err),
            fileName: err && err.fileName ? err.fileName : null,
            line: err && err.line ? err.line : null,
            number: err && err.number ? err.number : null,
            source: err && err.source ? err.source : null,
            stack: err && err.stack ? err.stack : null
        });
        // Try to persist a report even if we fail mid-run.
        try { writeRunErrorReportIfAny(outFolder, batchTimestamp); } catch (e2) { }
        alert("Critical Error: " + (err && err.message ? err.message : String(err)) + "\n\nAn error report was written next to the export output (if possible).");
    } finally {
        app.preferences.rulerUnits = originalRulerUnits;
        app.displayDialogs = originalDisplayDialogs;
    }
}

/**
 * FIDELITY AUDIT ENGINE: Reverse-tracking the designer's steps
 * Generates a human-readable construction recipe of the PSD.
 */
function generateFidelityAudit(doc, outFolder, designName) {
    var report = "====================================================\n";
    report += "   DESIGN CONSTRUCTION AUDIT (REVERSE TRACKER)      \n";
    report += "   [Senior Developer Engineering Report]            \n";
    report += "====================================================\n";
    report += "Document: " + doc.name + "\n";
    report += "Date: " + new Date().toString() + "\n";
    report += "Instruction: Follow this recipe to reconstruct the UI manually.\n";
    report += "----------------------------------------------------\n\n";

    function walk(parent, indent) {
        for (var i = parent.layers.length - 1; i >= 0; i--) {
            var layer = parent.layers[i];
            var space = new Array(indent + 1).join("    ");
            var prefix = space + "➤ ";

            report += prefix + "LAYER: '" + layer.name + "'\n";
            report += space + "   [Step 1] Base: " + (layer.typename === "LayerSet" ? "Group/Folder" : (layer.kind.toString().replace("LayerKind.", ""))) + "\n";
            report += space + "   [Step 2] Compositing: Blend Mode '" + layer.blendMode.toString().replace("BlendMode.", "").toLowerCase() + "' at " + Math.round(layer.opacity) + "% opacity\n";

            // Identify Style Steps
            try {
                var styles = getLayerStyles(layer);
                var activeStyles = [];
                if (styles.shadow) {
                    var ds = styles.shadow;
                    activeStyles.push("Drop Shadow: Color " + ds.color + ", Distance " + ds.distance + "px, Blur " + ds.blur + "px, Angle " + ds.angle + "°");
                }
                if (styles.innerShadow) {
                    var isd = styles.innerShadow;
                    activeStyles.push("Inner Shadow: Color " + isd.color + ", Distance " + isd.distance + "px, Blur " + isd.blur + "px");
                }
                if (styles.stroke) {
                    var str = styles.stroke;
                    activeStyles.push("Stroke: " + str.width + "px width, Color " + str.color + " (" + Math.round(str.opacity * 100) + "% opacity)");
                }
                if (styles.colorOverlay) {
                    activeStyles.push("Color Overlay: Forced to " + styles.colorOverlay.color + " (" + Math.round(styles.colorOverlay.opacity * 100) + "% opacity)");
                }
                if (styles.gradientOverlay) {
                    var go = styles.gradientOverlay;
                    activeStyles.push("Gradient Overlay: " + go.type + " mode, Angle " + go.angle + "°, Scale " + go.scale + "%");
                }
                if (styles.outerGlow) activeStyles.push("Outer Glow: Size " + styles.outerGlow.size + "px, Opacity " + Math.round(styles.outerGlow.opacity * 100) + "%");

                if (activeStyles.length > 0) {
                    report += space + "   [Step 3] Styling Details:\n";
                    for (var s = 0; s < activeStyles.length; s++) {
                        report += space + "      - " + activeStyles[s] + "\n";
                    }
                }
            } catch (e) { }

            // Identify Content Steps
            if (layer.kind === LayerKind.TEXT) {
                try {
                    var ti = layer.textItem;
                    report += space + "   [Step 4] Typography Construction:\n";
                    report += space + "      - Font: " + ti.font + "\n";
                    report += space + "      - Size: " + Math.round(ti.size.as('px')) + "px\n";
                    report += space + "      - Leading: " + (ti.useAutoLeading ? "Auto" : Math.round(ti.leading.as('px')) + "px") + "\n";
                    if (ti.tracking !== 0) report += space + "      - Tracking: " + ti.tracking + "\n";
                    report += space + "      - RAW CONTENT: \"" + ti.contents.substring(0, 100).replace(/\r/g, " ") + (ti.contents.length > 100 ? "..." : "") + "\"\n";
                } catch (e) { }
            }

            if (layer.kind === LayerKind.SMARTOBJECT) {
                try {
                    report += space + "   [Step 4] Smart Object Logic: Non-destructive architecture.\n";
                    var filters = getSmartFilterParams(layer);
                    if (filters && filters.smartFilters && filters.smartFilters.length > 0) {
                        report += space + "      - Applied Smart Filters: " + filters.smartFilters.join(", ") + "\n";
                    }
                    if (filters.cameraRaw) {
                        report += space + "      - Filter Detail: Camera Raw (Exposure: " + filters.cameraRaw.exposure + ")\n";
                    }
                } catch (e) { }
            }

            if (layer.typename === "LayerSet") {
                walk(layer, indent + 1);
            }
            report += "\n";
        }
    }

    walk(doc, 0);

    var auditFile = new File(outFolder + "/DESIGN_AUDIT_" + designName + ".txt");
    auditFile.encoding = "UTF8";
    auditFile.open("w");
    auditFile.write(report);
    auditFile.close();
}

function processDocument(doc, outFolder, batchTimestamp, designName) {
    // FIX 9 — LAB/CMYK color mode guard
    if (doc.mode !== DocumentMode.RGB) {
        doc.changeMode(ChangeMode.RGB);
        pushRunError("mode_conversion", { message: "Document converted from " + doc.mode + " to RGB for extraction." });
    }

    // ── 1080×1080 Canvas Override (Portrait) ────────────────────────────────
    // The target template size is fixed at 1080×1080 px (Portrait).
    // Note: User mentioned 1080*1080, but the design is Portrait, so we use
    // 1080 width and 1080 height to avoid clipping the bottom content.
    var _psdW = Math.round(doc.width.as("px"));
    var _psdH = Math.round(doc.height.as("px"));
    var docWidth = _psdW;   // Use actual PSD width
    var docHeight = _psdH;  // Use actual PSD height
    if (_psdW !== docWidth || _psdH !== docHeight) {
        pushRunError("canvas_size_override", {
            message: "PSD is " + _psdW + "x" + _psdH + " — overriding to fixed 1080x1080 portrait canvas. Layers outside will be clipped."
        });
    }
    // ─────────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    var templateId = "template_" + designName;
    var previewName = templateId + "_preview.jpg";

    savePreview(doc, previewName, outFolder, CONFIG.JPEG_QUALITY);

    var layerCounter = 0;
    var groupCounter = 0;
    var zIndexCounter = 1;
    var layouts = {};

    function collectLayers(parent, parentId, layersArray, offsetX, offsetY) {
        var buffered = [];
        var bakeActive = false;
        var skipIds = {};
        // Hoist variables to avoid ES3 clobbering in branches
        var stack, ub, chunkName, exported;

        if (!parent) {
            pushRunError("collect_layers_null_parent", {
                parentId: parentId
            });
            return;
        }

        if (!parent.layers || parent.layers.length === undefined) {
            pushRunError("collect_layers_invalid_parent", {
                parentId: parentId,
                parentType: (parent.typename || "unknown")
            });
            return;
        }

        function getBlendModeSafe(layer) {
            try { return layer.blendMode.toString().replace("BlendMode.", "").toLowerCase(); } catch (e) { return "normal"; }
        }

        function processOneLayer(layer) {
            try {
                var layerPB = getPreciseBounds(layer, docWidth, docHeight);
                if (layerPB.w <= 0 || layerPB.h <= 0) return; // SKIP EMPTY LAYERS

                var rawOpacity = layer.opacity / 100;
                var rawFill = layer.fillOpacity / 100;
                // Effective opacity ensures that layers with 'Fill' set low (common for effects) don't vanish.
                var effectiveOpacity = formatDecimal(rawOpacity * rawFill);

                var featureFlags = detectLayerFeatureFlags(layer);
                var item = {
                    id: "layer_" + layerCounter++,
                    name: layer.name,
                    parentId: parentId || null,
                    zIndex: zIndexCounter++,
                    visible: layer.visible,
                    role: getDetectedRole(layer.name),
                    locked: layer.allLocked || false,
                    editable: true, // Content remains editable even if position is locked.
                    x: formatDecimal(layerPB.x - (offsetX || 0)),
                    y: formatDecimal(layerPB.y - (offsetY || 0)),
                    w: layerPB.w,
                    h: layerPB.h,
                    opacity: effectiveOpacity,
                    rawOpacity: formatDecimal(rawOpacity),
                    fillOpacity: formatDecimal(rawFill),
                    blendMode: layer.blendMode.toString().replace("BlendMode.", "").toLowerCase(),
                    rotation: getLayerRotation(layer),
                    isClipped: (CONFIG.IGNORE_CLIPPING_MASKS === true) ? false : (layer.grouped || false),
                    features: featureFlags,
                    styles: getLayerStyles(layer),
                    blendIf: getBlendIf(layer)
                };

                // Clipping logic
                if (item.isClipped) {
                    var container = layer.parent;
                    var idx = indexOfLayerInContainer(container, layer);
                    if (idx !== -1) {
                        for (var k = idx + 1; k < container.layers.length; k++) {
                            var below = container.layers[k];
                            var belowClipped = false;
                            try { belowClipped = (below.grouped === true); } catch (eC) { }
                            if (!belowClipped) {
                                if (LAYER_ID_MAP[below.id]) item.clippedTo = LAYER_ID_MAP[below.id];
                                break;
                            }
                        }
                    }
                }
                LAYER_ID_MAP[layer.id] = item.id;

                // Adjustments and filters
                if (item.features.isAdjustmentLayer) {
                    var adj = getAdjustmentParams(layer);
                    if (adj) {
                        item.adjustmentType = adj.adjustmentType;
                        item.adjustmentParams = adj.adjustmentParams;
                    }
                }
                if (item.features.hasSmartFilters) {
                    var filters = getSmartFilterParams(layer);
                    for (var fKey in filters) { item[fKey] = filters[fKey]; }
                }
                if (layer.kind === LayerKind.SMARTOBJECT) {
                    item.embeddedDocument = null;
                }
                if (item.features.hasVectorMask) {
                    item.vectorMaskPath = getVectorMaskPath(layer);
                }

                safeguardLayerBounds(item, docWidth, docHeight);

                var decision = decideExportMode(layer, featureFlags);
                item.type = decision.type;
                item.editable = decision.editable;
                item.rasterizeReason = decision.reason || null;
                if (item.rasterizeReason && item.rasterizeReason.indexOf("blendmode_baked_") === 0) {
                    item.blendMode = "normal";
                }

                if (item.type === "text") {
                    if (CONFIG.TEXT_LAYER_MODE === "skip") return;
                    if (CONFIG.TEXT_LAYER_MODE === "raster") {
                        item.type = "image";
                        item.editable = false;
                        item.originalText = safeGetTextContents(layer);
                    } else {
                        applyTextData(item, layer, designName);
                        // Rule: Footer text layers often require 'fill: false' for custom mobile renderers
                        if (isInsideFooter(layer)) {
                            item.fill = false;
                        }
                    }
                } else if (item.type === "shape") {
                    applyShapeData(item, layer);
                } else {
                    item.type = "image";
                }

                if (item.type !== "text" && item.fillOpacity === 0) {
                    item.fillOpacity = 1;
                }

                var shouldExportAsset = (item.type !== "text");
                var exportedAssetOk = (item.type === "text");
                if (shouldExportAsset && layerPB.cw > 0 && layerPB.ch > 0 && layer.visible) {
                    var fileName = "asset_" + designName + "_" + (layerCounter - 1) + ".png";
                    var actualExport = exportLayerAsset(layer, fileName, outFolder, layerPB);
                    if (actualExport) {
                        // For shapes, we keep the vector data and only attach the image as a reference/fallback
                        // but do NOT change the type to "image" or delete its shape properties.
                        item.value = fileName;
                        item.src = fileName;
                        exportedAssetOk = true;

                        // FIX D: ALWAYS use the post-trim bounds returned by exportLayerAsset.
                        // The old guard (actualExport.w !== item.w) was wrong — even when the width
                        // doesn't change, the x/y origin may have shifted due to trimming transparent
                        // pixels. Skipping the update left stale coordinates from getPreciseBounds.
                        item.x = formatDecimal(actualExport.x - (offsetX || 0));
                        item.y = formatDecimal(actualExport.y - (offsetY || 0));
                        item.w = actualExport.w;
                        item.h = actualExport.h;
                        // Re-apply safe bounds guard after export may have updated x/y/w/h
                        // (exportLayerAsset overwrites bounds, so we must guard again here)
                        safeguardLayerBounds(item, docWidth, docHeight);

                        // Export mask as Base64 if present
                        if (featureFlags.hasLayerMask || featureFlags.hasVectorMask) {
                            try {
                                var maskData = exportLayerMaskBase64(layer, outFolder, item.id);
                                if (maskData) item.maskBase64 = maskData;
                            } catch (eMask) { }
                        }
                    } else {
                        pushRunError("asset_export_failed", {
                            templateId: templateId,
                            design: designName,
                            docName: safeDocName(doc),
                            layerName: safeLayerName(layer),
                            layerId: safeLayerId(layer),
                            fileName: fileName,
                            bounds: { x: layerPB.x, y: layerPB.y, w: layerPB.w, h: layerPB.h, cw: layerPB.cw, ch: layerPB.ch }
                        });

                        // Special-case: clipping masks sometimes fail per-layer export due to PS quirks.
                        // Retry by baking the whole clipped stack as a single chunk.
                        try {
                            if (CONFIG.IGNORE_CLIPPING_MASKS !== true && CONFIG.BAKE_CLIPPING_MASKS === true && item.rasterizeReason === "clipping_mask") {
                                stack = collectClippedStackGlobal(layer);
                                ub = unionBoundsForLayers(stack, docWidth, docHeight);
                                if (ub && ub.cw > 0 && ub.ch > 0) {
                                    chunkName = "chunk_" + designName + "_" + (layerCounter - 1) + ".png";
                                    exported = exportChunkAsset(stack, chunkName, outFolder, ub);
                                    if (exported) {
                                        item.type = "image";
                                        item.editable = false;
                                        item.rasterizeReason = "clipping_chunk";
                                        item.value = chunkName;
                                        item.src = chunkName;
                                        item.isClipped = false;
                                        exportedAssetOk = true;
                                        item.x = formatDecimal(exported.x - (offsetX || 0));
                                        item.y = formatDecimal(exported.y - (offsetY || 0));
                                        item.w = exported.w; item.h = exported.h;
                                    }
                                }
                            }
                        } catch (eClipRetry) { }
                    }
                }
                // Never emit an image layer without an asset reference; it breaks downstream renderers.
                // If export fails we log it and skip the layer (fidelity already lost anyway).
                // EXCEPTION: shape layers carry full vector metadata (color, radius, stroke) so they
                // are always emitted even when the optional raster fallback export fails.
                if (item.type === "image" && exportedAssetOk !== true) {
                    return;
                }

                // ── User-replaceable image flag ──────────────────────────────
                // Mark eligible image layers so the mobile app can show a
                // "Change Image" / "Replace" button for them.
                // Decorative layers (light overlays, dotted lines, reflections)
                // are excluded because replacing them makes no design sense.
                if (CONFIG.USER_REPLACEABLE_IMAGES && item.type === "image") {
                    var _n = (item.name || "").toLowerCase();
                    var _isDecorative =
                        (item.rasterizeReason && item.rasterizeReason.indexOf("blendmode_baked_") === 0) ||
                        _n.indexOf("reflection") !== -1 ||
                        _n.indexOf("dotted") !== -1 ||
                        _n.indexOf("overlay") !== -1 ||
                        _n.indexOf("shadow") !== -1 ||
                        _n.indexOf("noise") !== -1;
                    if (!_isDecorative) {
                        item.userReplaceable = true;
                    }
                }
                // ────────────────────────────────────────────────────────────

                // Clamp final bounds to canvas so no layer exceeds the design dimensions
                clampBoundsToCanvas(item, docWidth, docHeight);

                // Apply inherited group effects (like Color Overlay or Group Opacity)
                var inherited = getInheritedGroupEffects(layer);
                if (inherited.colorOverlay) {
                    item.styles.colorOverlay = inherited.colorOverlay;
                }
                item.opacity = formatDecimal(item.opacity * inherited.opacity);
                item.rawOpacity = item.opacity;

                layersArray.push(item);
            } catch (layerErr) {
                pushRunError("layer_processing_error", {
                    templateId: templateId,
                    design: designName,
                    docName: safeDocName(doc),
                    layerName: safeLayerName(layer),
                    layerId: safeLayerId(layer),
                    message: layerErr && layerErr.message ? layerErr.message : String(layerErr),
                    fileName: layerErr && layerErr.fileName ? layerErr.fileName : null,
                    line: layerErr && layerErr.line ? layerErr.line : null,
                    number: layerErr && layerErr.number ? layerErr.number : null,
                    source: layerErr && layerErr.source ? layerErr.source : null,
                    stack: layerErr && layerErr.stack ? layerErr.stack : null
                });
            }
        }

        function flushBufferedIndividually() {
            for (var bi = 0; bi < buffered.length; bi++) {
                processOneLayer(buffered[bi], parentId, layersArray, offsetX, offsetY);
            }
            buffered.length = 0;
            bakeActive = false;
        }

        function flushBufferedAsChunk() {
            if (!buffered || buffered.length === 0) return;
            try {
                var ub = unionBoundsForLayers(buffered, docWidth, docHeight);
                if (!ub || ub.cw <= 0 || ub.ch <= 0) {
                    flushBufferedIndividually();
                    return;
                }
                var fileName = "chunk_" + designName + "_" + layerCounter + ".png";
                var exported = exportChunkAsset(buffered, fileName, outFolder, ub);
                if (!exported) {
                    flushBufferedIndividually();
                    return;
                }
                var chunkItem = {
                    id: "layer_" + layerCounter++,
                    name: "blend_chunk",
                    parentId: parentId || null,
                    zIndex: zIndexCounter++,
                    visible: true,
                    role: "content",
                    editable: false,
                    w: exported.w, h: exported.h,
                    opacity: 1,
                    fillOpacity: 1,
                    blendMode: "normal",
                    rotation: 0,
                    isClipped: false,
                    features: { chunk: true },
                    styles: { shadow: null, innerShadow: null, stroke: null, colorOverlay: null, gradientOverlay: null, outerGlow: null, innerGlow: null },
                    type: "image",
                    rasterizeReason: "blend_chunk",
                    value: fileName,
                    src: fileName,
                    x: formatDecimal(exported.x - (offsetX || 0)),
                    y: formatDecimal(exported.y - (offsetY || 0))
                };
                clampBoundsToCanvas(chunkItem, docWidth, docHeight);
                layersArray.push(chunkItem);
            } catch (e) {
                flushBufferedIndividually();
            } finally {
                buffered.length = 0;
                bakeActive = false;
            }
        }

        for (var i = parent.layers.length - 1; i >= 0; i--) {
            var layer = parent.layers[i];
            // Skip layers that were baked into a clipping chunk
            try {
                if (skipIds[layer.id] === true) continue;
            } catch (eSkip) { }

            var isTextLayer = false;
            try { isTextLayer = (layer.kind === LayerKind.TEXT); } catch (e) { }

            var isRootArtboard = (parent === app.activeDocument && isArtboard(layer));

            // SPECIAL CASE: If a layer name contains "Group" and it's not a text layer,
            // or if it reports children, we MUST treat it as a group to find the images inside.
            var hasChildLayers = false;
            try { hasChildLayers = (layer.layers && layer.layers.length > 0); } catch (e) { }
            var nameIsGroup = (layer.name.indexOf("Group") !== -1 || layer.name.indexOf("group") !== -1);
            if ((layer.typename === "LayerSet" || hasChildLayers || nameIsGroup) && !isRootArtboard && !isTextLayer) {
                flushBufferedIndividually();
                var groupId = "group_" + groupCounter++;
                var gBounds = getPreciseBounds(layer, docWidth, docHeight);

                // ── Canvas-clip guard for groups ─────────────────────────────
                // With a fixed-canvas override (e.g. 1080×1080) the group's PSD
                // bounds may sit partially or fully outside the target rectangle.
                // Clamp the group's reported bounds to the visible canvas so the
                // renderer never sees negative/zero-size group containers.
                // Note: children are still processed and individually clamped;
                // a group is only skipped here if it is FULLY outside the canvas.
                var gClampedX = Math.max(gBounds.x - (offsetX || 0), 0);
                var gClampedY = Math.max(gBounds.y - (offsetY || 0), 0);
                var gClampedX2 = Math.min(gBounds.x - (offsetX || 0) + gBounds.w, docWidth);
                var gClampedY2 = Math.min(gBounds.y - (offsetY || 0) + gBounds.h, docHeight);
                var gVisW = Math.max(0, gClampedX2 - gClampedX);
                var gVisH = Math.max(0, gClampedY2 - gClampedY);
                if (gVisW <= 0 || gVisH <= 0) {
                    // Group is entirely outside the canvas — log and skip
                    pushRunError("group_outside_canvas", {
                        groupName: layer.name,
                        bounds: { x: gBounds.x, y: gBounds.y, w: gBounds.w, h: gBounds.h },
                        canvas: { w: docWidth, h: docHeight },
                        note: "Group and its children are fully outside the 1080x1080 canvas. Skipped."
                    });
                    continue;
                }

                var groupItem = {
                    id: groupId, name: layer.name, type: "group",
                    role: getDetectedRole(layer.name),
                    visible: layer.visible, parentId: parentId || null, zIndex: zIndexCounter++,
                    x: formatDecimal(gClampedX),
                    y: formatDecimal(gClampedY),
                    w: formatDecimal(gVisW),
                    h: formatDecimal(gVisH),
                    opacity: formatDecimal(layer.opacity / 100),
                    rotation: getLayerRotation(layer)
                };
                fillGroupDetails(groupItem, layer);
                layersArray.push(groupItem);

                // IMPORTANT: Always use 0,0 offset for ALL templates (flat and grouped).
                // The renderer uses ABSOLUTE canvas coordinates for every layer — it does NOT
                // add parent group x/y to child positions. Group x/y/w/h is metadata only
                // (used for grouping/visibility, not as a coordinate origin for children).
                // Using gBounds.x/gBounds.y here would make all child coordinates relative
                // to the group, which would break positioning in every template.
                collectLayers(layer, groupId, layersArray, 0, 0);
                continue;
            }

            // Bake clipping masks into the base layer asset and skip the clipped layers above.
            var isBaseOfClip = hasClippedLayersAboveGlobal(layer);
            var isTextLayer = false;
            try { isTextLayer = (layer.kind === LayerKind.TEXT); } catch (e) { }
            var shouldBakeClip = isBaseOfClip && !isTextLayer;

            if (CONFIG.IGNORE_CLIPPING_MASKS !== true && CONFIG.BAKE_CLIPPING_MASKS === true && shouldBakeClip) {
                flushBufferedIndividually();
                stack = collectClippedStackGlobal(layer);
                ub = unionBoundsForLayers(stack, docWidth, docHeight);
                if (ub && ub.cw > 0 && ub.ch > 0) {
                    chunkName = "chunk_" + designName + "_" + (layerCounter) + ".png";
                    exported = exportChunkAsset(stack, chunkName, outFolder, ub);
                    if (exported) {
                        var clippedItem = {
                            id: "layer_clip_" + (layerCounter++),
                            name: layer.name + " (baked clipping stack)",
                            parentId: parentId || null,
                            zIndex: zIndexCounter++,
                            visible: true,
                            role: getDetectedRole(layer.name),
                            editable: false,
                            w: exported.w, h: exported.h,
                            opacity: 1,
                            fillOpacity: 1,
                            blendMode: "normal",
                            rotation: 0,
                            isClipped: false,
                            features: { chunk: true, clipping: true, bakedStack: true },
                            styles: { shadow: null, innerShadow: null, stroke: null, colorOverlay: null, gradientOverlay: null, outerGlow: null, innerGlow: null },
                            type: "image",
                            rasterizeReason: "clipping_baked_fidelity",
                            value: chunkName,
                            src: chunkName,
                            x: formatDecimal(exported.x - (offsetX || 0)),
                            y: formatDecimal(exported.y - (offsetY || 0))
                        };
                        layersArray.push(clippedItem);

                        // CRITICAL FIX: Ensure all layers in the stack (base + clipped) 
                        // are marked as skipped so they never appear as individual artifacts.
                        for (var si = 0; si < stack.length; si++) {
                            try {
                                var layerIdString = String(stack[si].id);
                                skipIds[layerIdString] = true;
                            } catch (eMark) { }
                        }
                        continue;
                    }
                }
            }

            if (CONFIG.FEATURE_SUPPORT_MODE === "hybrid" && CONFIG.BAKE_BLEND_CHUNKS === true && layer.kind !== LayerKind.TEXT) {
                var bm = getBlendModeSafe(layer);
                // If we've already seen a blend layer, the first subsequent normal layer starts a new chunk.
                if (bakeActive && bm === "normal") {
                    flushBufferedAsChunk();
                }
                buffered.push(layer);
                if (bm !== "normal") bakeActive = true;
            } else {
                // For text or non-chunking mode, we flush any active bake chunk before processing
                if (bakeActive) flushBufferedAsChunk();
                flushBufferedIndividually();
                processOneLayer(layer, parentId, layersArray, offsetX, offsetY);
            }
        }

        if (bakeActive) flushBufferedAsChunk();
        else flushBufferedIndividually();
    }

    if (hasArtboards(doc)) {
        for (var k = 0; k < doc.layers.length; k++) {
            var lyr = doc.layers[k];
            if (isArtboard(lyr)) {
                var ab = getPreciseBounds(lyr, docWidth, docHeight);
                var abName = lyr.name.toLowerCase().replace(/[^a-z0-9]/g, "_") || "artboard_" + k;
                layouts[abName] = {
                    canvas: {
                        width: ab.w,
                        height: ab.h,
                        type: "color",
                        background: CONFIG.DEFAULT_CANVAS_BG,
                        colorRef: "background_primary",
                        fitMode: "fill",
                        editable: true,
                        previewUrl: previewName
                    },
                    layers: []
                };
                collectLayers(lyr, null, layouts[abName].layers, ab.x, ab.y);
            }
        }
    } else {
        layouts["square"] = {
            canvas: {
                width: docWidth,
                height: docHeight,
                type: "color",
                background: CONFIG.DEFAULT_CANVAS_BG,
                colorRef: "background_primary",
                fitMode: "fill",
                editable: true,
                previewUrl: previewName
            },
            layers: []
        };
        collectLayers(doc, null, layouts["square"].layers, 0, 0);
    }
    return { id: templateId, version: "1.1.0-v2.1", thumbnail: previewName, layouts: layouts };
}

/**
 * IDEA 1: Photoshop measures exact pixel positions of rendered text
 * Returns where PS actually draws text pixels, not just layer bounds
 */
function selectActiveLayerTransparency() {
    // Select visible pixels of the CURRENT active layer.
    // This is more reliable than selecting by layer id for text layers in Photoshop JSX.
    var idsetd = charIDToTypeID("setd");
    var desc = new ActionDescriptor();

    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
    desc.putReference(charIDToTypeID("null"), ref);

    var ref2 = new ActionReference();
    ref2.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("Trsp"));
    ref2.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("T   "), ref2);

    executeAction(idsetd, desc, DialogModes.NO);
}

function deselectSafe() {
    try { app.activeDocument.selection.deselect(); } catch (e) { }
}

function closeDocNoSave(doc) {
    try {
        if (doc) {
            app.activeDocument = doc;
            doc.close(SaveOptions.DONOTSAVECHANGES);
        }
    } catch (e) { }
}

function getDocPixelSize(doc) {
    return {
        w: Math.round(doc.width.as("px")),
        h: Math.round(doc.height.as("px")),
        res: doc.resolution
    };
}

/**
 * Robust real glyph bounds measurement.
 * Method:
 * 1) Try active text-layer transparency selection.
 * 2) If Photoshop fails, duplicate the text layer into a transparent temp doc,
 *    rasterize it, then select the rasterized pixels.
 */
function measureRealTextGlyphBounds(layer) {
    var activeDoc = app.activeDocument;
    var result = null;
    var tempDoc = null;

    // Attempt 1: direct active-layer transparency selection.
    try {
        app.activeDocument = activeDoc;
        activeDoc.activeLayer = layer;
        selectActiveLayerTransparency();
        var sb = activeDoc.selection.bounds;
        result = {
            x: sb[0].as("px"),
            y: sb[1].as("px"),
            r: sb[2].as("px"),
            b: sb[3].as("px"),
            method: "activeLayer.transparency.selection"
        };
        deselectSafe();
        if ((result.r - result.x) > 0 && (result.b - result.y) > 0) return result;
    } catch (e1) {
        deselectSafe();
    }

    // Attempt 2: duplicate into same-size temp document, rasterize, then measure.
    try {
        app.activeDocument = activeDoc;
        activeDoc.activeLayer = layer;

        var ds = getDocPixelSize(activeDoc);
        tempDoc = app.documents.add(
            UnitValue(ds.w, "px"),
            UnitValue(ds.h, "px"),
            ds.res,
            "__TEXT_GLYPH_MEASURE_TEMP__",
            NewDocumentMode.RGB,
            DocumentFill.TRANSPARENT
        );

        app.activeDocument = activeDoc;
        var dup = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);
        app.activeDocument = tempDoc;
        tempDoc.activeLayer = dup;

        try { dup.visible = true; } catch (eV) { }
        try { dup.rasterize(RasterizeType.ENTIRELAYER); } catch (eR) { }

        selectActiveLayerTransparency();
        var tb = tempDoc.selection.bounds;
        result = {
            x: tb[0].as("px"),
            y: tb[1].as("px"),
            r: tb[2].as("px"),
            b: tb[3].as("px"),
            method: "tempDoc.rasterizedText.selection"
        };
        deselectSafe();
        closeDocNoSave(tempDoc);
        app.activeDocument = activeDoc;

        if ((result.r - result.x) > 0 && (result.b - result.y) > 0) return result;
    } catch (e2) {
        try { deselectSafe(); } catch (eD) { }
        closeDocNoSave(tempDoc);
        try { app.activeDocument = activeDoc; } catch (eA) { }
    }

    return null;
}

/**
 * V2 TEXT METRICS ENGINE - REAL GLYPH VERSION
 * No ascenderRatio. No guessed shiftY.
 * Measures Photoshop-rendered pixels and exports real glyph box.
 */
function measureTextPixelPosition(layer, item) {
    try {
        if (!layer || layer.kind !== LayerKind.TEXT) return null;

        var layerBounds = layer.bounds;
        var layerLeft = layerBounds[0].as("px");
        var layerTop = layerBounds[1].as("px");
        var layerRight = layerBounds[2].as("px");
        var layerBottom = layerBounds[3].as("px");
        var layerWidth = layerRight - layerLeft;
        var layerHeight = layerBottom - layerTop;

        var real = measureRealTextGlyphBounds(layer);

        var pixelLeft = layerLeft;
        var pixelTop = layerTop;
        var pixelRight = layerRight;
        var pixelBottom = layerBottom;
        var measurementMethod = "layer.bounds.fallback";

        if (real) {
            pixelLeft = real.x;
            pixelTop = real.y;
            pixelRight = real.r;
            pixelBottom = real.b;
            measurementMethod = real.method;
        }

        var glyphLeft = pixelLeft - layerLeft;
        var glyphTop = pixelTop - layerTop;
        var glyphWidth = pixelRight - pixelLeft;
        var glyphHeight = pixelBottom - pixelTop;

        var text = String(item.value || "");
        var lineCount = 1;
        for (var i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) lineCount++;
        }

        var isIndic = false;
        for (var c = 0; c < text.length; c++) {
            var code = text.charCodeAt(c);
            if (code >= 0x0900 && code <= 0x0DFF) {
                isIndic = true;
                break;
            }
        }

        return {
            engine: "textMetricsV2",
            renderMode: "glyph-align",
            measurementMethod: measurementMethod,

            // Compatibility fields for frontend: use these for text x/y.
            shiftY: formatDecimal(glyphTop),
            shiftX: formatDecimal(glyphLeft),
            useThisX: formatDecimal(pixelLeft),
            useThisY: formatDecimal(pixelTop),
            useThisWidth: formatDecimal(glyphWidth),
            useThisHeight: formatDecimal(glyphHeight),
            originalY: formatDecimal(layerTop),

            psLayerBox: {
                x: formatDecimal(layerLeft),
                y: formatDecimal(layerTop),
                w: formatDecimal(layerWidth),
                h: formatDecimal(layerHeight)
            },

            psGlyphBox: {
                x: formatDecimal(pixelLeft),
                y: formatDecimal(pixelTop),
                w: formatDecimal(glyphWidth),
                h: formatDecimal(glyphHeight)
            },

            glyphOffset: {
                x: formatDecimal(glyphLeft),
                y: formatDecimal(glyphTop)
            },

            fontSize: formatDecimal(item.fontSize || 0),
            lineHeight: formatDecimal(item.lineHeight || 0),
            fontWeight: item.fontWeight || "400",
            lineCount: lineCount,
            isIndic: isIndic
        };
    } catch (e) {
        try { deselectSafe(); } catch (e2) { }
        return null;
    }
}


/**
 * V2.1 TEXT METRICS PROBE
 * Uses the existing exportLayerAsset() pipeline to rasterize + trim text pixels.
 * This is more reliable than ActionManager transparency selection for live text.
 * It does NOT convert the text layer to image; it only creates a temporary probe PNG,
 * reads the trimmed bounds returned by exportLayerAsset(), then deletes the probe file.
 */
function applyTextMetricsFromRasterProbe(item, layer, outFolder, designName, layerPB) {
    try {
        if (!item || !layer || layer.kind !== LayerKind.TEXT || !outFolder || !layerPB) return false;

        var probeName = "__text_probe_" + designName + "_" + item.id + ".png";
        var actual = exportLayerAsset(layer, probeName, outFolder, layerPB);
        if (!actual || actual.w <= 0 || actual.h <= 0) return false;

        var lb = layer.bounds;
        var layerLeft = lb[0].as("px");
        var layerTop = lb[1].as("px");
        var layerRight = lb[2].as("px");
        var layerBottom = lb[3].as("px");
        var layerWidth = layerRight - layerLeft;
        var layerHeight = layerBottom - layerTop;

        var glyphLeft = actual.x - layerLeft;
        var glyphTop = actual.y - layerTop;

        var text = String(item.value || "");
        var lineCount = 1;
        for (var i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) lineCount++;
        }

        var isIndic = false;
        for (var c = 0; c < text.length; c++) {
            var code = text.charCodeAt(c);
            if (code >= 0x0900 && code <= 0x0DFF) { isIndic = true; break; }
        }

        var metrics = {
            engine: "textMetricsV2.1",
            renderMode: "glyph-align",
            measurementMethod: "exportLayerAsset.rasterizedText.trim",
            shiftY: formatDecimal(glyphTop),
            shiftX: formatDecimal(glyphLeft),
            useThisX: formatDecimal(actual.x),
            useThisY: formatDecimal(actual.y),
            useThisWidth: formatDecimal(actual.w),
            useThisHeight: formatDecimal(actual.h),
            originalY: formatDecimal(layerTop),
            psLayerBox: {
                x: formatDecimal(layerLeft),
                y: formatDecimal(layerTop),
                w: formatDecimal(layerWidth),
                h: formatDecimal(layerHeight)
            },
            psGlyphBox: {
                x: formatDecimal(actual.x),
                y: formatDecimal(actual.y),
                w: formatDecimal(actual.w),
                h: formatDecimal(actual.h)
            },
            glyphOffset: {
                x: formatDecimal(glyphLeft),
                y: formatDecimal(glyphTop)
            },
            fontSize: formatDecimal(item.fontSize || 0),
            lineHeight: formatDecimal(item.lineHeight || 0),
            fontWeight: item.fontWeight || "400",
            lineCount: lineCount,
            isIndic: isIndic
        };

        item.textMetricsV2 = metrics;
        item.psMeasured = metrics;

        // Optional cleanup: the metrics PNG is not needed by frontend.
        try {
            var f = new File(outFolder.fsName + SEP + probeName);
            if (f.exists) f.remove();
        } catch (eDel) { }

        return true;
    } catch (e) {
        return false;
    }
}


function applyTextData(item, layer, designName) {
    item.type = "text";

    // ── Step 1: Basic text content ──
    var ti = null;
    try {
        ti = layer.textItem;
        item.value = ti.contents.replace(/\r/g, "\n");
    } catch (e1) { item.value = layer.name; }
    if (!ti) { item.value = layer.name; return; }

    // ── Step 2: Text alignment ──
    try {
        var rawJustify = ti.justification.toString().replace("Justification.", "").toLowerCase();
        if (rawJustify === "center" || rawJustify === "centerjustified") item.textAlign = "center";
        else if (rawJustify === "right" || rawJustify === "rightjustified") item.textAlign = "right";
        else if (rawJustify === "fullyjustified") item.textAlign = "justify";
        else item.textAlign = "left";
    } catch (e2) { item.textAlign = "left"; }

    if (item.value) {
        item.value = String(item.value).replace(/[\r\n]+$/, '');
    }



    // ── Step 3: Font size & leading from Photoshop ──
    var fontSizePx = 0;
    var leadingPx = 0;
    var docRes = 72;
    try { docRes = app.activeDocument.resolution; } catch (e) { }
    var resFactor = docRes / 72;

    try {
        var refT = new ActionReference();
        refT.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var descT = executeActionGet(refT);
        if (descT.hasKey(stringIDToTypeID("textKey"))) {
            var textKey = descT.getObjectValue(stringIDToTypeID("textKey"));
            var rangeList = textKey.getList(stringIDToTypeID("textStyleRange"));
            var style0 = rangeList.getObjectValue(0).getObjectValue(stringIDToTypeID("textStyle"));

            if (style0.hasKey(stringIDToTypeID("size"))) {
                var sizeVal = style0.getUnitDoubleValue(stringIDToTypeID("size"));
                var sizeUnit = style0.getUnitDoubleType(stringIDToTypeID("size"));
                if (sizeUnit === charIDToTypeID("#Pxl") || typeIDToStringID(sizeUnit) === "pixelsUnit") {
                    fontSizePx = sizeVal;
                } else {
                    fontSizePx = sizeVal * resFactor;
                }
            }
            if (style0.hasKey(stringIDToTypeID("leading"))) {
                leadingPx = style0.getUnitDoubleValue(stringIDToTypeID("leading")) * resFactor;
            }
        }
    } catch (eAM) { }

    if (!fontSizePx || fontSizePx <= 0) {
        try {
            fontSizePx = ti.size.as("px");
            leadingPx = ti.useAutoLeading ? (fontSizePx * CONFIG.RUNE_AUTO_LEADING) : ti.leading.as("px");
        } catch (eSize) { }
    }

    if (!fontSizePx || fontSizePx <= 0) { fontSizePx = 12; leadingPx = 14; }

    // ── Step 4: Orientation ──
    var orientation = "horizontal";
    try { orientation = ti.orientation.toString().replace("Direction.", "").toLowerCase(); } catch (e) { }
    item.orientation = orientation;

    var tracking = 0; try { tracking = ti.tracking; } catch (e) { }

    if (orientation === "vertical") {
        item.orientation = "horizontal";
        item.isStacked = true;
        item.type = "text";
        item.editable = true;
        if (Math.abs(item.rotation || 0) < 0.1) item.rotation = 90;
    }

    // ── Step 5: Matrix scaling & rotation ──
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        if (desc.hasKey(stringIDToTypeID("textKey"))) {
            var textKey = desc.getObjectValue(stringIDToTypeID("textKey"));
            if (textKey.hasKey(stringIDToTypeID("transform"))) {
                var m = textKey.getObjectValue(stringIDToTypeID("transform"));
                var xx = m.getDouble(stringIDToTypeID("xx")), xy = m.getDouble(stringIDToTypeID("xy"));
                var yx = m.getDouble(stringIDToTypeID("yx")), yy = m.getDouble(stringIDToTypeID("yy"));
                var scaleX = Math.sqrt(xx * xx + xy * xy), scaleY = Math.sqrt(yx * yx + yy * yy);
                var matrixRotation = Math.atan2(xy, xx) * 180 / Math.PI;
                if (Math.abs(matrixRotation) > 0.01) item.rotation = formatDecimal(matrixRotation);
                var scale = Math.max(scaleX, scaleY);
                fontSizePx *= scale;
                leadingPx *= scale;
            }
        }
    } catch (eMatrix) { }

    try {
        var refStyle = new ActionReference();
        refStyle.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var textDesc = executeActionGet(refStyle).getObjectValue(stringIDToTypeID("textKey"));
        var range0 = textDesc.getList(stringIDToTypeID("textStyleRange")).getObjectValue(0);
        var style0 = range0.getObjectValue(stringIDToTypeID("textStyle"));
        var vScale = style0.hasKey(stringIDToTypeID("verticalScale")) ? (style0.getDouble(stringIDToTypeID("verticalScale")) / 100) : 1.0;
        var hScale = style0.hasKey(stringIDToTypeID("horizontalScale")) ? (style0.getDouble(stringIDToTypeID("horizontalScale")) / 100) : 1.0;
        var charScale = Math.max(vScale, hScale);
        fontSizePx *= charScale;
        leadingPx *= charScale;
    } catch (eChar) { }

    // ── Step 6: Computed text metrics ──
    item.fontSize = Math.round(fontSizePx);

    // Detect Indic script (Devanagari, Bengali, Tamil, Telugu, etc.)
    var _txt = String(item.value || "");
    var _isIndic = false;
    for (var _ci = 0; _ci < _txt.length; _ci++) {
        var _code = _txt.charCodeAt(_ci);
        if (_code >= 0x0900 && _code <= 0x0DFF) { _isIndic = true; break; }
    }

    var _autoMult = _isIndic ? 1.4 : CONFIG.RUNE_AUTO_LEADING;
    var finalLeadingPx;

    if (!leadingPx || leadingPx <= 0 || leadingPx < fontSizePx * 0.9) {
        finalLeadingPx = fontSizePx * _autoMult;
    } else if (leadingPx > fontSizePx * 2.5) {
        // ⚠️ Too large - cap to PREVENT issues
        // Use a SMARTER cap that respects designer intent
        // For Indic: 1.5×, for Latin: 1.4× (less aggressive than before)
        finalLeadingPx = fontSizePx * (_isIndic ? 1.5 : 1.4);
        item.originalLineHeight = Math.round(leadingPx);
        item.lineHeightCapped = true;
    } else {
        finalLeadingPx = leadingPx;
    }

    item.lineHeight = Math.round(finalLeadingPx);
    item.letterSpacing = formatDecimal((tracking / 1000) * fontSizePx);

    item.fontSizePx = item.fontSize;
    item.fontSizePt = Math.round(fontSizePx / resFactor);
    item.lineHeightPx = item.lineHeight;
    item.letterSpacingPx = item.letterSpacing;
    item.baselineShift = 0;
    item.horizontalShift = 0;

    // ── Step 7: Font family & style ──
    try { item.fontFamily = getFontFamilyName(layer); } catch (eFF) { item.fontFamily = ""; }

    try {
        var dominantPS = getDominantPostScriptName(layer);
        item.fontPostScriptName = dominantPS || ti.font;
    } catch (ePS) { try { item.fontPostScriptName = ti.font; } catch (ePS2) { item.fontPostScriptName = ""; } }

    try { item.fontWeight = getFontWeightNumeric(item.fontPostScriptName); } catch (eFW) { item.fontWeight = "400"; }

    try {
        item.fontStyle = (ti.font.toLowerCase().indexOf("italic") !== -1 || ti.font.toLowerCase().indexOf("oblique") !== -1) ? "italic" : "normal";
    } catch (eFS) { item.fontStyle = "normal"; }

    try { item.textTransform = getTextTransform(layer); } catch (eTT) { item.textTransform = "none"; }

    try {
        if (typeof dominantStyle !== "undefined" && dominantStyle) {
            item.underline = isTextDecorationEnabled(dominantStyle.getEnumerationValue(stringIDToTypeID("underline")));
            item.strikethrough = isTextDecorationEnabled(dominantStyle.getEnumerationValue(stringIDToTypeID("strikethrough")));
        } else {
            item.underline = isTextDecorationEnabled(ti.underline);
            item.strikethrough = isTextDecorationEnabled(ti.strikeThru);
        }
    } catch (e) { item.underline = false; item.strikethrough = false; }

    // ──────────────────────────────────────────────────────────────────────
    // ── Step 8: SMART UNIVERSAL BASELINE SHIFT (FIXED for all cases) ─────
    //
    // KEY FIX: Use containerHeight as the PRIMARY measurement
    // Only compensate for empty space inside container — NEVER overshoot!
    // ──────────────────────────────────────────────────────────────────────
    try {
        var fontSize = item.fontSize;
        var weight = parseInt(item.fontWeight) || 400;
        var containerHeight = item.h;
        var lineHeight = item.lineHeight || (fontSize * 1.2);

        // ── Detect line count from ACTUAL content only (not estimation) ──
        var lineCount = 1;
        try {
            var txt = String(item.value || "");
            var matches = txt.match(/[\r\n]/g);
            if (matches) lineCount = matches.length + 1;
        } catch (eLC) { }
        // DO NOT estimate from container — caused false detection for rotated text

        // ── Universal ascent ratio ──
        var ascentRatio;
        if (weight >= 900) ascentRatio = 0.82;
        else if (weight >= 800) ascentRatio = 0.81;
        else if (weight >= 700) ascentRatio = 0.80;
        else if (weight >= 600) ascentRatio = 0.79;
        else if (weight >= 500) ascentRatio = 0.78;
        else if (weight >= 400) ascentRatio = 0.77;
        else if (weight >= 300) ascentRatio = 0.75;
        else ascentRatio = 0.73;

        // Indic scripts: SMALLER adjustment (they don't need much)
        if (_isIndic) ascentRatio += 0.02;

        // ── Calculate single-line ideal height ──
        var idealSingleLineHeight = fontSize * 1.2;

        // ── Determine working height (FIXED logic) ──
        // Always use the SMALLER of: container OR lineHeight × lineCount
        // This prevents over-shifting for huge containers
        var totalContentHeight = lineHeight * lineCount;
        var workingHeight;

        if (lineCount > 1) {
            // Multi-line: use lineHeight (per-line)
            workingHeight = lineHeight;
        } else {
            // Single-line: use SMALLER of container or fontSize × 1.5
            // This prevents huge containers from causing huge shifts
            var maxSingleLine = fontSize * 1.5;
            workingHeight = Math.min(containerHeight, maxSingleLine);
        }

        // ── Calculate ascent in pixels ──
        var ascent = fontSize * ascentRatio;

        // ── Empty space above the cap ──
        var emptySpace = (workingHeight - ascent) / 2;
        if (emptySpace < 0) emptySpace = 0;

        // ── Weight-based correction (SMALLER than before) ──
        var correction;
        if (weight >= 800) correction = fontSize * 0.02;
        else if (weight >= 700) correction = fontSize * 0.03;
        else if (weight >= 600) correction = fontSize * 0.04;
        else if (weight >= 400) correction = fontSize * 0.05;
        else correction = fontSize * 0.06;

        // Indic needs LESS correction (their glyphs sit lower)
        if (_isIndic) correction *= 0.5;

        // ── Calculate base shift ──
        var shift = -(emptySpace + correction);

        // ── Multi-line reduction ──
        if (lineCount > 1) {
            shift *= 0.4;
        }

        // ── REMOVED oversize compensation (was causing UP shift bug) ──
        // The previous logic was pushing text up too much for big containers

        // ── Size-based fine-tuning (SAFER ranges) ──
        if (fontSize <= 15) {
            shift *= 1.10;
        } else if (fontSize > 150) {
            shift *= 0.85;  // Very large fonts need LESS shift
        } else if (fontSize > 100) {
            shift *= 0.90;
        }

        // ── Rotation safety ──
        // Rotated text often has different visual behavior — reduce shift
        var rotation = item.rotation || 0;
        if (Math.abs(rotation) > 10) {
            shift *= 0.6;  // Reduce for rotated text
        }

        // ── Safety clamps (TIGHTER than before) ──
        var maxShift = fontSize * 0.35;  // Was 0.6 — too aggressive
        var minShift = fontSize * 0.02;
        if (shift < -maxShift) shift = -maxShift;
        if (shift > -minShift) shift = -minShift;

        item.baselineShift = formatDecimal(shift);
        item.lineCount = lineCount;

    } catch (eBL) {
        item.baselineShift = formatDecimal(-(item.fontSize * 0.15));
    }

    // ──────────────────────────────────────────────────────────────────────
    // ── Step 8b: SMART HORIZONTAL SHIFT (Indic excluded) ─────────────────
    //
    // FIX: Indic scripts should NOT get horizontal shift (they have correct
    // bearing). Only apply to Latin/Cyrillic heavy fonts.
    // ──────────────────────────────────────────────────────────────────────
    try {
        var fontSize = item.fontSize;
        var weight = parseInt(item.fontWeight) || 400;
        var hShift = 0;

        // Skip horizontal shift for Indic scripts entirely
        if (!_isIndic && weight >= 600) {
            var weightExtra = weight - 500;
            var weightFactor = weightExtra / 1000;
            hShift = fontSize * weightFactor * 0.10;  // Was 0.15 — too much

            // Clamp to max 3% of fontSize (was 4%)
            var maxH = fontSize * 0.03;
            if (hShift > maxH) hShift = maxH;
        }

        // Skip horizontal shift for rotated text
        var rotation = item.rotation || 0;
        if (Math.abs(rotation) > 10) hShift = 0;

        item.horizontalShift = hShift > 0 ? formatDecimal(hShift) : 0;
    } catch (eHS) { item.horizontalShift = 0; }

    // ── Step 9: Color ──
    try { item.color = getLayerColor(layer); } catch (eClr) { item.color = null; }
    if (!item.color) item.color = "#FFFFFF";
    item.fill = true;

    try {
        if (layer._gradFill) { item.gradientFill = layer._gradFill; delete layer._gradFill; }
    } catch (eGrad) { }
    item.colorRef = getColorRef(item.color);

    // ── Step 10: Rich Text Detection ──
    try {
        var refKey = new ActionReference();
        refKey.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var textDesc2 = executeActionGet(refKey).getObjectValue(stringIDToTypeID("textKey"));
        var ranges = textDesc2.getList(stringIDToTypeID("textStyleRange"));
        if (ranges.count > 1) {
            var s1 = ranges.getObjectValue(0).getObjectValue(stringIDToTypeID("textStyle"));
            var s2 = ranges.getObjectValue(1).getObjectValue(stringIDToTypeID("textStyle"));
            if (s1.hasKey(stringIDToTypeID("color")) && s2.hasKey(stringIDToTypeID("color"))) {
                if (hexFromDesc(s1.getObjectValue(stringIDToTypeID("color"))) !== hexFromDesc(s2.getObjectValue(stringIDToTypeID("color")))) {
                    item.isRichText = true;
                }
            }
        }
    } catch (eRich) { }

    // ── Step 11: Warp ──
    try {
        item.warp = getTextWarp(layer);
        if (item.warp) item.hasWarp = true;
    } catch (eWarp) { item.warp = null; }

    // ── Step 12: Font URLs ──
    try { item.googleFontUrl = buildGoogleFontUrl(item.fontFamily, item.fontWeight); } catch (eGF) { item.googleFontUrl = null; }

    try {
        var rawPs = String(ti.font || "").replace(/[+#\s]/g, "");
        var psLower = rawPs.toLowerCase();
        var pref = CONFIG.PREFERRED_FONT_EXTENSION.replace(".", "");

        var names = [];
        names.push(psLower);
        var base = psLower.replace("-regular", "").replace("regular", "");
        if (base !== psLower) names.push(base);
        var sb = psLower.replace("semibold", "sb").replace("-semibold", "-sb").replace("sb-regular", "-sb").replace("sbregular", "-sb");
        if (sb !== psLower && sb !== psLower.replace("-regular", "")) names.push(sb);
        var bold1 = psLower.replace("-boldmt", "bd").replace("-bold", "bd").replace("bold", "bd");
        var bold2 = psLower.replace("-boldmt", "b").replace("-bold", "b").replace("bold", "b");
        if (bold1 !== psLower && bold1 !== base) names.push(bold1);
        if (bold2 !== psLower && bold2 !== base && bold2 !== bold1) names.push(bold2);
        var ital = psLower.replace("-italicmt", "i").replace("-italic", "i").replace("italic", "i");
        if (ital !== psLower && ital !== base) names.push(ital);
        var bi = psLower.replace("-bolditalicmt", "bi").replace("-bolditalic", "bi").replace("bolditalic", "bi").replace("bi-regular", "bi");
        if (bi !== psLower && bi !== base) names.push(bi);
        var kruti = psLower.replace("krutidev", "krdev").replace("kruti-dev", "krdev");
        if (kruti !== psLower) names.push(kruti);
        var simple = psLower.replace(/-/g, "");
        if (simple !== psLower && simple !== base) names.push(simple);

        item.fontUrls = [];
        var seenUrls = {};
        var exts = [pref];
        for (var e = 0; e < CONFIG.FONT_EXTENSIONS.length; e++) {
            var ext = CONFIG.FONT_EXTENSIONS[e].replace(".", "");
            if (ext !== pref) exts.push(ext);
        }

        for (var ni = 0; ni < names.length; ni++) {
            for (var xi = 0; xi < exts.length; xi++) {
                var url = CONFIG.FONT_BASE_URL + names[ni] + "." + exts[xi];
                if (!seenUrls[url]) { item.fontUrls.push(url); seenUrls[url] = true; }
            }
        }
    } catch (eFU) { item.fontUrls = []; }

    // ── Step 13: Rotation coordinate adjustment ──
    try {
        var rot = item.rotation || 0;
        var absRot = Math.abs(rot % 360);
        var isVertical = (absRot > 45 && absRot < 135) || (absRot > 225 && absRot < 315);
        if (isVertical) {
            var rawW = item.w;
            var rawH = item.h;
            item.w = rawH;
            item.h = rawW;
            item.x = formatDecimal(item.x + (rawW / 2) - (item.w / 2));
            item.y = formatDecimal(item.y + (rawH / 2) - (item.h / 2));
        }
    } catch (eRot) { }

    // IDEA 1: Measure actual text pixel positions
    try {
        pushRunError("psMeasure_calling", {
            layerName: layer.name
        });

        var measured = measureTextPixelPosition(layer, item);

        if (measured) {
            // V2 metrics: actual Photoshop-rendered glyph bounds.
            item.textMetricsV2 = measured;

            // Backward compatibility for your old Flutter parser.
            item.psMeasured = measured;

            // IMPORTANT: V2 stops fake movement from old heuristic shifts.
            // Keep old values only for debugging.
            item.legacyBaselineShift = item.baselineShift || 0;
            item.legacyHorizontalShift = item.horizontalShift || 0;
            item.baselineShift = 0;
            item.horizontalShift = 0;

            pushRunError("psMeasureV2_attached", {
                layerName: layer.name
            });
        } else {
            pushRunError("psMeasure_returnedNull", {
                layerName: layer.name
            });
        }
    } catch (eMeasure) {
        pushRunError("psMeasure_callError", {
            layerName: layer.name,
            error: eMeasure.toString()
        });
    }


}

function isTextDecorationEnabled(decoration) {
    try {
        if (decoration === undefined || decoration === null) return false;

        // Handle Action Manager TypeIDs (numbers) by converting to string first
        var s = (typeof decoration === "number") ? typeIDToStringID(decoration) : String(decoration);
        s = s.toLowerCase();

        // If it contains "on", it's definitely enabled
        if (s.indexOf("on") !== -1) return true;

        // If it contains "off" or "none", it's disabled
        if (s.indexOf("off") !== -1) return false;
        if (s.indexOf("none") !== -1) return false;

        // Fallback for DOM types which might not contain "on" but don't contain "off"
        // (e.g. UnderlineType.UNDERLINELEFT)
        return s.indexOf("underline") !== -1 || s.indexOf("strike") !== -1;
    } catch (e) {
        return false;
    }
}

// PHOTOSHOP_FONT_MAP is now defined at the top of the file (before main()).
// See the global variables section near line 53.
// This comment block intentionally left as a navigation marker.
var _FONT_MAP_MOVED_TO_TOP = true; // marker — do not remove


// ─── Google Fonts URL Builder ─────────────────────────────────────────────────
// Looks up the font family in PHOTOSHOP_FONT_MAP (defined at top of file):
//   * Known system/Adobe font (null entry) -> returns null
//   * Known Google Font                    -> returns Google Fonts CSS2 URL
//   * Unknown font (not in map)            -> attempts Google Fonts URL as-is
//     (downstream renderer validates with a HEAD request)
function buildGoogleFontUrl(familyName, weight) {
    try {
        if (!familyName) return null;
        var lower = familyName.toLowerCase();

        // Check our curated map first
        if (typeof PHOTOSHOP_FONT_MAP !== "undefined" && PHOTOSHOP_FONT_MAP.hasOwnProperty(lower)) {
            var mapped = PHOTOSHOP_FONT_MAP[lower];
            // If mapped to null, it's a system font -> return null (use fallbacks)
            if (mapped === null) return null;
            // If mapped to a string, use that specific Google Font family name
            familyName = mapped;
        }

        var key = String(familyName).replace(/\s+/g, "+");
        return "https://fonts.googleapis.com/css2?family=" + key + "&display=swap";
    } catch (e) {
        return null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────


// ─── Dominant Style Range Helper ─────────────────────────────────────────────
// A single Photoshop text layer can have MULTIPLE textStyleRanges — one per run
// of characters that share the same style. If a designer accidentally applies
// a different font to just the first character (e.g. ROG Fonts on "P" while the
// rest of "remium" uses Cambria), reading styleRange[0] gives the wrong answer.
//
// Fix: iterate ALL ranges, pick the one with the LARGEST character span
// (dominant range = the font that covers the most text in the layer).
// ─────────────────────────────────────────────────────────────────────────────
function getDominantStyleObject(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        var textKey = desc.getObjectValue(stringIDToTypeID("textKey"));
        var rangeList = textKey.getList(stringIDToTypeID("textStyleRange"));

        var bestStyle = null;
        var bestSpan = -1;
        for (var ri = 0; ri < rangeList.count; ri++) {
            try {
                var rangeObj = rangeList.getObjectValue(ri);
                var from = rangeObj.hasKey(stringIDToTypeID("from")) ? rangeObj.getInteger(stringIDToTypeID("from")) : 0;
                var to = rangeObj.hasKey(stringIDToTypeID("to")) ? rangeObj.getInteger(stringIDToTypeID("to")) : 0;
                var span = to - from;
                if (span > bestSpan) {
                    bestSpan = span;
                    bestStyle = rangeObj.getObjectValue(stringIDToTypeID("textStyle"));
                }
            } catch (eRange) { }
        }
        return bestStyle; // may be null if list is empty
    } catch (e) {
        return null;
    }
}

function getFontFamilyName(layer) {
    var style = getDominantStyleObject(layer);
    if (style) {
        var family = "";
        var styleName = "";

        try {
            if (style.hasKey(stringIDToTypeID("fontFamilyName"))) {
                family = style.getString(stringIDToTypeID("fontFamilyName"));
            }
        } catch (e1) { }

        try {
            if (style.hasKey(stringIDToTypeID("fontStyleName"))) {
                styleName = style.getString(stringIDToTypeID("fontStyleName"));
            }
        } catch (e2) { }

        // If we have both, return "Family Style" (e.g. "Montserrat Black Italic")
        // but avoid "Family Regular" if possible.
        if (family && styleName) {
            if (styleName === "Regular" || styleName === "Normal") return family;
            return family + " " + styleName;
        }

        // Fallback to fontName which is often the full display name
        try {
            if (style.hasKey(stringIDToTypeID("fontName"))) {
                return style.getString(stringIDToTypeID("fontName"));
            }
        } catch (e3) { }

        if (family) return family;
    }

    // Fallback: Photoshop DOM (returns fontFamily of the text item)
    try { return layer.textItem.fontFamily; } catch (e4) { }
    try { return layer.textItem.font; } catch (e5) { }
    return "";
}

// Returns the PostScript name (e.g. "Cambria-Bold") from the DOMINANT range.
function getDominantPostScriptName(layer) {
    var style = getDominantStyleObject(layer);
    if (style) {
        try {
            if (style.hasKey(stringIDToTypeID("fontPostScriptName"))) {
                return style.getString(stringIDToTypeID("fontPostScriptName"));
            }
        } catch (e1) { }
        // Older PS versions store it under "fontName" at the PS level
        try {
            if (style.hasKey(stringIDToTypeID("fontStyleName"))) {
                // Build a heuristic PS name: family + style
                var fam = style.hasKey(stringIDToTypeID("fontFamilyName")) ? style.getString(stringIDToTypeID("fontFamilyName")) : "";
                var styl = style.getString(stringIDToTypeID("fontStyleName"));
                if (fam && styl) return fam.replace(/\s+/g, "") + "-" + styl.replace(/\s+/g, "");
            }
        } catch (e2) { }
    }
    // Fallback: Photoshop DOM
    try { return layer.textItem.font; } catch (e3) { }
    return "";
}

function safeGetTextContents(layer) {
    try {
        if (layer && layer.textItem && layer.textItem.contents !== undefined) {
            return String(layer.textItem.contents).replace(/\r/g, "\n");
        }
    } catch (e) { }
    return "";
}

function isLayerEditable(layer) {
    if (!CONFIG.AUTO_EDITABLE_IMAGES) return false;
    var n = layer.name.toLowerCase();

    // Force editable with '+' prefix - highest priority for designers
    if (layer.name.indexOf("+") === 0) return true;

    // Keywords for content placeholders
    if (n.indexOf("placeholder") !== -1 || n.indexOf("photo") !== -1 || n.indexOf("image") !== -1 ||
        n.indexOf("asset") !== -1 || n.indexOf("user") !== -1 || n.indexOf("profile") !== -1 ||
        n.indexOf("avatar") !== -1) return true;

    // Roles that are typically editable
    var role = getDetectedRole(layer.name);
    if (role === "logo" || role === "background") return true;

    return false;
}

function getFidelityScore(layer) {
    try {
        var id = layer.id;
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), id);
        var desc = executeActionGet(ref);

        // 1. Layer Masks
        if (desc.hasKey(stringIDToTypeID("hasLayerMask")) && desc.getBoolean(stringIDToTypeID("hasLayerMask"))) return true;
        if (desc.hasKey(stringIDToTypeID("hasVectorMask")) && desc.getBoolean(stringIDToTypeID("hasVectorMask"))) return true;

        // 2. Complex Blend Modes
        var blend = typeIDToStringID(desc.getEnumerationValue(stringIDToTypeID("mode")));
        var complexBlends = ["vividLight", "linearLight", "difference", "exclusion", "subtraction", "divide", "hue", "saturation", "color", "luminosity"];
        for (var i = 0; i < complexBlends.length; i++) if (blend === complexBlends[i]) return true;

        // 3. Smart Filters
        if (desc.hasKey(stringIDToTypeID("smartObject"))) {
            var so = desc.getObjectValue(stringIDToTypeID("smartObject"));
            if (so.hasKey(stringIDToTypeID("filterFX"))) return true;
        }
        if (desc.hasKey(stringIDToTypeID("filterFX"))) return true;
    } catch (e) { }
    return false;
}

function decideExportMode(layer, features) {
    // ── ADD THIS FIRST ────────────────────────────────────────────────────
    // If layer is clipped (grouped=true), it is ALWAYS an image
    // No matter what is below it (shape, fill, etc.)
    // This must be checked BEFORE any other logic
    try {
        if (layer.grouped === true && CONFIG.IGNORE_CLIPPING_MASKS === false) {
            return { type: "image", editable: false, reason: "clipped_layer" };
        }
    } catch (eClip) { }
    // ─────────────────────────────────────────────────────────────────────

    // TEXT is always text — check first before any guard.
    if (layer.kind === LayerKind.TEXT) return { type: "text", editable: true };

    // SMART OBJECTS should always be images for fidelity unless they are specifically live shapes.
    var isSO = false;
    try { isSO = (layer.kind === LayerKind.SMARTOBJECT); } catch (e) { }
    if (isSO && !isShapeLayer(layer)) {
        return { type: "image", editable: false, reason: "smart_object" };
    }

    // SHAPE PRIORITY GUARD: A Live Shape (has keyOriginType / contentLayer) owns its
    // vector mask as geometry — it is NOT an external pixel mask. We must classify it
    // as "shape" BEFORE checking hasVectorMask.
    if (isColorFillLayer(layer) && features.hasLayerMask) {
        return { type: "image", editable: false, reason: "colorfill_with_mask" };
    }

    if (isShapeLayer(layer)) return { type: "shape", editable: true };

    // FIDELITY GUARD: Force rasterization for complex DESIGN features on non-shape layers.
    var unsupported = (features && (features.hasSmartFilters || features.hasLayerMask || features.hasVectorMask || features.hasPatternFill));
    var forceImage = (layer.name.indexOf("*") === 0) || unsupported;

    if (forceImage || isSO) {
        return { type: "image", editable: false, reason: isSO ? "smart_object" : "fidelity_guard_triggered" };
    }

    return { type: "image", editable: false };
}

function isColorFillLayer(layer) {
    try {
        // Solid fill adjustment layers usually expose this kind.
        if (layer.kind === LayerKind.SOLIDFILL) return true;
    } catch (e) { }
    try {
        // Fallback heuristic (common default name).
        return /^color fill\b/i.test(layer.name);
    } catch (e2) { }
    return false;
}

// BUG 8 — Color reference helper
function getColorRef(hex) {
    if (!hex) return null;
    var upper = String(hex).toUpperCase();
    if (CONFIG.BRAND_COLORS[upper]) return CONFIG.BRAND_COLORS[upper];
    return null;
}

// BUG 6 — Extraction of Blend If sliders
function getBlendIf(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        if (desc.hasKey(stringIDToTypeID("blendOptions"))) {
            var bo = desc.getObjectValue(stringIDToTypeID("blendOptions"));
            if (bo.hasKey(stringIDToTypeID("blendClampInfo"))) {
                var bci = bo.getList(stringIDToTypeID("blendClampInfo"));
                // Index 0: Gray channel (typically)
                if (bci.count > 0) {
                    var gray = bci.getObjectValue(0);
                    var b = {
                        thisLayer: {
                            shadowMin: gray.getInteger(stringIDToTypeID("srcBlackMin")),
                            shadowMax: gray.getInteger(stringIDToTypeID("srcBlackMax")),
                            highlightMin: gray.getInteger(stringIDToTypeID("srcWhiteMin")),
                            highlightMax: gray.getInteger(stringIDToTypeID("srcWhiteMax"))
                        },
                        underlyingLayer: {
                            shadowMin: gray.getInteger(stringIDToTypeID("destBlackMin")),
                            shadowMax: gray.getInteger(stringIDToTypeID("destBlackMax")),
                            highlightMin: gray.getInteger(stringIDToTypeID("destWhiteMin")),
                            highlightMax: gray.getInteger(stringIDToTypeID("destWhiteMax"))
                        }
                    };
                    // Check if default (0,0,255,255)
                    var isDefault = (b.thisLayer.shadowMin === 0 && b.thisLayer.shadowMax === 0 && b.thisLayer.highlightMin === 255 && b.thisLayer.highlightMax === 255 &&
                        b.underlyingLayer.shadowMin === 0 && b.underlyingLayer.shadowMax === 0 && b.underlyingLayer.highlightMin === 255 && b.underlyingLayer.highlightMax === 255);
                    return isDefault ? null : b;
                }
            }
        }
    } catch (e) { }
    return null;
}

// BUG 7 — Extraction of Text Warp
function getTextWarp(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        if (desc.hasKey(stringIDToTypeID("textKey"))) {
            var tk = desc.getObjectValue(stringIDToTypeID("textKey"));
            if (tk.hasKey(stringIDToTypeID("warp"))) {
                var w = tk.getObjectValue(stringIDToTypeID("warp"));
                var style = typeIDToStringID(w.getEnumerationValue(stringIDToTypeID("warpStyle")));
                if (style !== "warpNone") {
                    return {
                        style: style.replace("warp", "").toLowerCase(),
                        value: w.hasKey(stringIDToTypeID("warpValue")) ? w.getDouble(stringIDToTypeID("warpValue")) : 0,
                        perspective: w.hasKey(stringIDToTypeID("warpPerspective")) ? w.getDouble(stringIDToTypeID("warpPerspective")) : 0,
                        perspectiveOther: w.hasKey(stringIDToTypeID("warpPerspectiveOther")) ? w.getDouble(stringIDToTypeID("warpPerspectiveOther")) : 0,
                        rotate: typeIDToStringID(w.getEnumerationValue(stringIDToTypeID("warpRotate"))).replace("rotate", "").toLowerCase()
                    };
                }
            }
        }
    } catch (e) { }
    return null;
}

// BUG 4 — Adjustment parameters extraction
function getAdjustmentParams(layer) {
    var result = null;
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        if (desc.hasKey(stringIDToTypeID("adjustment"))) {
            var adjList = desc.getList(stringIDToTypeID("adjustment"));
            if (adjList.count > 0) {
                var adj = adjList.getObjectValue(0);

                // Curves
                if (adj.hasKey(stringIDToTypeID("curves"))) {
                    var curves = adj.getList(stringIDToTypeID("curves"));
                    var channels = {};
                    for (var i = 0; i < curves.count; i++) {
                        var c = curves.getObjectValue(i);
                        var chanKey = c.getEnumerationValue(stringIDToTypeID("channel"));
                        var chanName = typeIDToStringID(chanKey).replace("channel", "").replace("Channel", "");
                        if (!chanName) chanName = "RGB";
                        var ptsList = c.getList(stringIDToTypeID("curve"));
                        var pList = [];
                        for (var j = 0; j < ptsList.count; j++) {
                            var p = ptsList.getObjectValue(j);
                            pList.push([p.getInteger(stringIDToTypeID("horizontal")), p.getInteger(stringIDToTypeID("vertical"))]);
                        }
                        channels[chanName] = pList;
                    }
                    result = { adjustmentType: "curves", adjustmentParams: { channels: channels } };
                }
                // Hue/Saturation
                else if (adj.hasKey(stringIDToTypeID("hueLightnessSaturation"))) {
                    var hls = adj.getList(stringIDToTypeID("hueLightnessSaturation")).getObjectValue(0);
                    result = {
                        adjustmentType: "hue", adjustmentParams: {
                            hue: hls.getInteger(stringIDToTypeID("hue")),
                            saturation: hls.getInteger(stringIDToTypeID("saturation")),
                            lightness: hls.getInteger(stringIDToTypeID("lightness"))
                        }
                    };
                }
                // Brightness/Contrast
                else if (adj.hasKey(stringIDToTypeID("brightness"))) {
                    result = {
                        adjustmentType: "brightnessContrast", adjustmentParams: {
                            brightness: adj.getInteger(stringIDToTypeID("brightness")),
                            contrast: adj.getInteger(stringIDToTypeID("contrast"))
                        }
                    };
                }
            }
        }
    } catch (e) { }
    return result;
}

// FIX 10 — Vector Mask SVG Path extraction
function getVectorMaskPath(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        var vm = null;
        if (desc.hasKey(stringIDToTypeID("vectorMask"))) {
            vm = desc.getObjectValue(stringIDToTypeID("vectorMask"));
        } else if (desc.hasKey(stringIDToTypeID("pathContents"))) {
            vm = desc.getObjectValue(stringIDToTypeID("pathContents"));
        }

        if (vm) {
            var pathObj = vm.hasKey(stringIDToTypeID("path")) ? vm.getObjectValue(stringIDToTypeID("path")) : vm;

            // Check for standard components
            if (pathObj.hasKey(stringIDToTypeID("pathComponents"))) {
                var comps = pathObj.getList(stringIDToTypeID("pathComponents"));
                var svg = "";
                for (var i = 0; i < comps.count; i++) {
                    var comp = comps.getObjectValue(i);
                    if (comp.hasKey(stringIDToTypeID("subpathListKey"))) {
                        var subs = comp.getList(stringIDToTypeID("subpathListKey"));
                        for (var j = 0; j < subs.count; j++) {
                            var sub = subs.getObjectValue(j);
                            var points = sub.getList(stringIDToTypeID("points"));
                            for (var k = 0; k < points.count; k++) {
                                var pt = points.getObjectValue(k);
                                var anchor = pt.getObjectValue(stringIDToTypeID("anchor"));
                                var ax = anchor.getUnitDoubleValue(stringIDToTypeID("horizontal"));
                                var ay = anchor.getUnitDoubleValue(stringIDToTypeID("vertical"));
                                svg += (k === 0 ? "M " : "L ") + formatDecimal(ax) + " " + formatDecimal(ay) + " ";
                            }
                            if (sub.getBoolean(stringIDToTypeID("closedSubpath"))) svg += "Z ";
                        }
                    }
                }
                if (svg.length > 0) return "<path d='" + svg.replace(/\s+$/, "") + "' />";
            }

            // Fallback for Live Shapes (keyOriginBox)
            // If the mask is a simple Live Shape (Rectangle/Ellipse), extract the box geometry.
            if (desc.hasKey(stringIDToTypeID("keyOriginType"))) {
                var origins = desc.getList(stringIDToTypeID("keyOriginType"));
                if (origins.count > 0) {
                    var o = origins.getObjectValue(0);
                    if (o.hasKey(stringIDToTypeID("keyOriginBox"))) {
                        var box = o.getObjectValue(stringIDToTypeID("keyOriginBox"));
                        var l = box.getUnitDoubleValue(stringIDToTypeID("left"));
                        var t = box.getUnitDoubleValue(stringIDToTypeID("top"));
                        var r = box.getUnitDoubleValue(stringIDToTypeID("right"));
                        var b = box.getUnitDoubleValue(stringIDToTypeID("bottom"));
                        var rectPath = "M " + formatDecimal(l) + " " + formatDecimal(t) +
                            " L " + formatDecimal(r) + " " + formatDecimal(t) +
                            " L " + formatDecimal(r) + " " + formatDecimal(b) +
                            " L " + formatDecimal(l) + " " + formatDecimal(b) + " Z";
                        return "<path d='" + rectPath + "' />";
                    }
                }
            }
        }
    } catch (e) { }
    return null;
}

// BUG 3 — Group details (blendMode, passThrough, knockout)
function fillGroupDetails(groupItem, layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        var bmValue = desc.getEnumerationValue(stringIDToTypeID("mode"));
        var bm = typeIDToStringID(bmValue);
        groupItem.blendMode = (bm === "passThrough") ? "passThrough" : (bm === "normal" ? "normal" : bm);

        groupItem.knockout = desc.hasKey(stringIDToTypeID("knockout")) ? typeIDToStringID(desc.getEnumerationValue(stringIDToTypeID("knockout"))) : "none";
        groupItem.blendInterior = desc.hasKey(stringIDToTypeID("blendInterior")) ? desc.getBoolean(stringIDToTypeID("blendInterior")) : false;
    } catch (e) {
        groupItem.blendMode = "normal";
        groupItem.knockout = "none";
        groupItem.blendInterior = false;
    }
}

// FIX 12/13 — Smart Filter Parameters (Camera Raw, Displacement)
function getSmartFilterParams(layer) {
    var filters = {};
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        // Check for smart filters in various possible keys
        var filterDesc = null;
        if (desc.hasKey(stringIDToTypeID("smartObject"))) {
            var so = desc.getObjectValue(stringIDToTypeID("smartObject"));
            if (so.hasKey(stringIDToTypeID("filterFX"))) filterDesc = so.getList(stringIDToTypeID("filterFX"));
        }
        if (!filterDesc && desc.hasKey(stringIDToTypeID("filterFX"))) {
            filterDesc = desc.getList(stringIDToTypeID("filterFX"));
        }

        if (filterDesc) {
            for (var i = 0; i < filterDesc.count; i++) {
                var f = filterDesc.getObjectValue(i);
                var fName = f.hasKey(stringIDToTypeID("filterName")) ? f.getString(stringIDToTypeID("filterName")) : "";
                var fData = f.hasKey(stringIDToTypeID("filterSettings")) ? f.getObjectValue(stringIDToTypeID("filterSettings")) : null;

                if (fName.indexOf("Camera Raw") !== -1 && fData) {
                    filters.cameraRaw = {
                        exposure: fData.hasKey(stringIDToTypeID("Exposure")) ? fData.getDouble(stringIDToTypeID("Exposure")) : 0,
                        highlights: fData.hasKey(stringIDToTypeID("Highlights2012")) ? fData.getDouble(stringIDToTypeID("Highlights2012")) : 0,
                        temperature: fData.hasKey(stringIDToTypeID("Temperature")) ? fData.getInteger(stringIDToTypeID("Temperature")) : 0
                    };
                } else if (fName.indexOf("Displace") !== -1 && fData) {
                    filters.displacementMap = {
                        sourceFile: fData.hasKey(stringIDToTypeID("displacementMapFile")) ? String(fData.getPath(stringIDToTypeID("displacementMapFile"))) : null,
                        hScale: fData.hasKey(stringIDToTypeID("horizontalScale")) ? fData.getInteger(stringIDToTypeID("horizontalScale")) : 10,
                        vScale: fData.hasKey(stringIDToTypeID("verticalScale")) ? fData.getInteger(stringIDToTypeID("verticalScale")) : 10
                    };
                }
            }
        }
    } catch (e) { }
    return filters;
}

function detectLayerFeatureFlags(layer) {
    var flags = {
        hasLayerMask: false,
        hasVectorMask: false,
        hasSmartFilters: false,
        hasComplexFx: false,
        isAdjustmentLayer: false,
        hasPatternFill: false,
        forceTransparency: (layer.name.toLowerCase().indexOf(CONFIG.FORCE_TRANSPARENCY_PREFIX.toLowerCase()) !== -1)
    };

    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        try { flags.hasLayerMask = desc.hasKey(stringIDToTypeID("hasUserMask")) && desc.getBoolean(stringIDToTypeID("hasUserMask")); } catch (eM) { }
        try { flags.hasVectorMask = desc.hasKey(stringIDToTypeID("hasVectorMask")) && desc.getBoolean(stringIDToTypeID("hasVectorMask")); } catch (eV) { }

        // Adjustment layers (Levels, Curves, etc.)
        // EXCLUSION: Solid Fill and Gradient Fill layers are VISIBLE content, not adjustments.
        try {
            if (desc.hasKey(stringIDToTypeID("adjustment"))) {
                var k = layer.kind;
                if (k !== LayerKind.SOLIDFILL && k !== LayerKind.GRADIENTFILL) {
                    flags.isAdjustmentLayer = true;
                }
            }
        } catch (eAdj) { }

        // Smart filters
        try {
            if (desc.hasKey(stringIDToTypeID("smartObject"))) {
                var so = desc.getObjectValue(stringIDToTypeID("smartObject"));
                if (so && so.hasKey(stringIDToTypeID("filterFX"))) flags.hasSmartFilters = true;
            }
            if (desc.hasKey(stringIDToTypeID("filterFX"))) flags.hasSmartFilters = true;
        } catch (eFX) { }

        // Layer effects: mark complex if effects other than simple ones exist
        try {
            var lefxKey = stringIDToTypeID("layerEffects");
            var lefxChar = charIDToTypeID("Lefx");
            if (desc.hasKey(lefxKey) || desc.hasKey(lefxChar)) {
                var fx = desc.getObjectValue(desc.hasKey(lefxKey) ? lefxKey : lefxChar);
                var complex = false;
                var isText = (layer.kind === LayerKind.TEXT);

                // Updated "Universal Guard" list: forced rasterization for these features
                var knownComplexKeys = ["gradientOverlay", "gradientFill", "patternOverlay", "innerShadow", "outerGlow", "innerGlow", "bevelEmboss", "satin", "colorOverlay", "chromeFX", "dropShadowMulti"];

                // Fidelity Rule: If layer name starts with asterisk (*), force PNG rasterization
                if (layer.name.indexOf("*") === 0) complex = true;

                for (var i = 0; i < knownComplexKeys.length; i++) {
                    var k = stringIDToTypeID(knownComplexKeys[i]);
                    if (fx.hasKey(k)) {
                        try {
                            if (fx.getObjectValue(k).getBoolean(stringIDToTypeID("enabled"))) {
                                // EXEMPTIONS: Simple Gradients and Shadows on text are supported natively now.
                                if (isText && (knownComplexKeys[i] === "gradientOverlay" || knownComplexKeys[i] === "dropShadow" || knownComplexKeys[i] === "outerGlow")) {
                                    continue;
                                }
                                complex = true; break;
                            }
                        } catch (eEn) { complex = true; break; }
                    }
                }
                flags.hasComplexFx = complex;
            }
        } catch (eLfx) { }

        // Pattern/gradient fills via adjustment descriptor
        try {
            if (desc.hasKey(stringIDToTypeID("adjustment"))) {
                var adj = desc.getList(stringIDToTypeID("adjustment"));
                if (adj && adj.count > 0) {
                    var a0 = adj.getObjectValue(0);
                    if (a0.hasKey(stringIDToTypeID("pattern"))) flags.hasPatternFill = true;
                }
            }
        } catch (ePat) { }
    } catch (eTop) { }
    return flags;
}
function generateShapeSVG(item) {
    try {
        var w = item.w;
        var h = item.h;
        var color = item.color || "#000000";

        if (!w || !h || w <= 0 || h <= 0) return null;

        // ⭐ Get stroke info
        var stroke = item.stroke;
        var strokeAttrs = "";
        var strokePadding = 0;

        if (stroke && stroke.width > 0) {
            var strokeColor = stroke.color || "#000000";
            var strokeWidth = stroke.width;
            var strokeOpacity = stroke.opacity || 1;

            // Padding for stroke (so it doesn't get clipped at edges)
            strokePadding = strokeWidth;

            strokeAttrs = " stroke='" + strokeColor + "'" +
                " stroke-width='" + strokeWidth + "'" +
                " stroke-opacity='" + strokeOpacity + "'";
        }

        // Adjust viewBox to accommodate stroke
        var vbW = w + strokePadding;
        var vbH = h + strokePadding;
        var offset = strokePadding / 2;

        // ── CIRCLE / ELLIPSE ──
        if (item.shape === "circle" || item.shape === "ellipse") {
            var rx = (w - strokePadding) / 2;
            var ry = (h - strokePadding) / 2;
            var cx = w / 2;
            var cy = h / 2;

            return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + w + " " + h +
                "' preserveAspectRatio='none'>" +
                "<ellipse cx='" + cx + "' cy='" + cy + "' rx='" + rx + "' ry='" + ry +
                "' fill='" + color + "'" + strokeAttrs + "/>" +
                "</svg>";
        }

        // ── RECTANGLE ──
        if (item.shape === "rectangle") {
            var r = item.borderRadius;

            if (typeof r === "object" && r !== null) {
                var tl = Math.max(0, r.tl || 0);
                var tr = Math.max(0, r.tr || 0);
                var bl = Math.max(0, r.bl || 0);
                var br = Math.max(0, r.br || 0);

                // Adjust path to account for stroke
                var inset = strokePadding / 2;
                var pathW = w - strokePadding;
                var pathH = h - strokePadding;

                var path = "M " + (tl + inset) + " " + inset + " ";
                path += "L " + (pathW - tr + inset) + " " + inset + " ";
                if (tr > 0) {
                    path += "Q " + (pathW + inset) + " " + inset + " " + (pathW + inset) + " " + (tr + inset) + " ";
                } else {
                    path += "L " + (pathW + inset) + " " + inset + " ";
                }
                path += "L " + (pathW + inset) + " " + (pathH - br + inset) + " ";
                if (br > 0) {
                    path += "Q " + (pathW + inset) + " " + (pathH + inset) + " " + (pathW - br + inset) + " " + (pathH + inset) + " ";
                } else {
                    path += "L " + (pathW + inset) + " " + (pathH + inset) + " ";
                }
                path += "L " + (bl + inset) + " " + (pathH + inset) + " ";
                if (bl > 0) {
                    path += "Q " + inset + " " + (pathH + inset) + " " + inset + " " + (pathH - bl + inset) + " ";
                } else {
                    path += "L " + inset + " " + (pathH + inset) + " ";
                }
                path += "L " + inset + " " + (tl + inset) + " ";
                if (tl > 0) {
                    path += "Q " + inset + " " + inset + " " + (tl + inset) + " " + inset + " ";
                } else {
                    path += "L " + inset + " " + inset + " ";
                }
                path += "Z";

                return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + w + " " + h +
                    "' preserveAspectRatio='none'>" +
                    "<path d='" + path + "' fill='" + color + "'" + strokeAttrs + "/>" +
                    "</svg>";
            }

            // Uniform radius
            var radius = typeof r === "number" ? r : 0;
            var inset = strokePadding / 2;

            return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + w + " " + h +
                "' preserveAspectRatio='none'>" +
                "<rect x='" + inset + "' y='" + inset +
                "' width='" + (w - strokePadding) + "' height='" + (h - strokePadding) +
                "' rx='" + radius + "' ry='" + radius +
                "' fill='" + color + "'" + strokeAttrs + "/>" +
                "</svg>";
        }

        return null;
    } catch (e) {
        return null;
    }
}



function applyShapeData(item, layer) {
    item.type = "shape";
    item.shape = getShapeType(layer);
    item.color = getLayerColor(layer);

    if (layer._gradFill) {
        item.gradientFill = layer._gradFill;
        delete layer._gradFill;
    }

    item.borderRadius = getCornerRadius(layer);
    item.stroke = getLayerStroke(layer);
    item.colorRef = getColorRef(item.color);

    if (item.color === null) {
        item.transparent = true;
        item.color = null;
    }

    // Existing path-to-rectangle conversion
    if (item.shape === "path" && item.borderRadius) {
        var hasRadius = false;
        if (typeof item.borderRadius === "number" && item.borderRadius > 0) {
            hasRadius = true;
        } else if (typeof item.borderRadius === "object") {
            if (item.borderRadius.tl > 0 ||
                item.borderRadius.tr > 0 ||
                item.borderRadius.bl > 0 ||
                item.borderRadius.br > 0) {
                hasRadius = true;
            }
        }
        if (hasRadius) {
            item.shape = "rectangle";
        }
    }

    // ⭐ NEW: Generate SVG string for this shape
    var svgString = generateShapeSVG(item);
    if (svgString) {
        item.svgString = svgString;
    }
}


function getTextTransformScale(layer) {
    var scale = 1.0;
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        var tk = desc.getObjectValue(stringIDToTypeID("textKey"));
        if (tk.hasKey(stringIDToTypeID("transform"))) {
            var m = tk.getObjectValue(stringIDToTypeID("transform"));
            var xx = m.getDouble(stringIDToTypeID("xx")), xy = m.getDouble(stringIDToTypeID("xy"));
            var yx = m.getDouble(stringIDToTypeID("yx")), yy = m.getDouble(stringIDToTypeID("yy"));
            var scaleX = Math.sqrt(xx * xx + xy * xy);
            var scaleY = Math.sqrt(yx * yx + yy * yy);
            scale = Math.max(scaleX, scaleY);
        }
    } catch (e) { }
    return scale;
}

function getPreciseBounds(layer, docW, docH) {
    // FIX: Special handling for Groups (LayerSets)
    // Union the bounds of all visible children to get the true group container size.
    if (layer.typename === "LayerSet") {
        try {
            var children = [];
            for (var i = 0; i < layer.layers.length; i++) {
                if (layer.layers[i].visible) children.push(layer.layers[i]);
            }
            if (children.length > 0) {
                var ub = unionBoundsForLayers(children, docW, docH);
                if (ub && ub.w > 0 && ub.h > 0) return ub;
            }
        } catch (eGroup) { }
    }

    // FIX 1: High-Precision Text Metrics Logic
    // Ensures vertical containers are tall enough to prevent Flutter font clipping
    if (layer.kind === LayerKind.TEXT) {
        try {
            var ti = layer.textItem;
            var fontSize = ti.size.as("px") * getTextTransformScale(layer);
            var bounds = layer.bounds;
            var l = bounds[0].as("px"), t = bounds[1].as("px"), r = bounds[2].as("px"), b = bounds[3].as("px");

            var orientation = "horizontal";
            try { orientation = ti.orientation.toString().replace("Direction.", "").toLowerCase(); } catch (e) { }

            var cw = r - l;
            var ch = b - t;
            var safeDim = fontSize * 1.2; // 1.2 enough 

            if (orientation === "vertical") {
                // Safeguard WIDTH for vertical stacked text
                if (cw < safeDim) {
                    var centerX = (l + r) / 2;
                    l = centerX - (safeDim / 2);
                    r = centerX + (safeDim / 2);
                }
            } else {
                // Safeguard HEIGHT for horizontal text
                if (ch < safeDim) {
                    // keep top fixed
                    b = t + safeDim;
                }
            }
            return calculateBoundsObject(l, t, r, b, docW, docH);
        } catch (e) { }
    }

    var l, t, r, b;
    var doc = app.activeDocument;

    // Attempt 1: Key Origin (Mathematical vector bounds for Live Shapes)
    // This is the most precise way to get the designer's intended dimensions
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        if (desc.hasKey(stringIDToTypeID("keyOriginType"))) {
            var isSO = false;
            try { isSO = (layer.kind === LayerKind.SMARTOBJECT || desc.hasKey(stringIDToTypeID("smartObject")) || desc.hasKey(charIDToTypeID("SmOf"))); } catch (eKind) { }

            if (!isSO || isShapeLayer(layer)) {
                var origin = desc.getList(stringIDToTypeID("keyOriginType")).getObjectValue(0);
                if (origin.hasKey(stringIDToTypeID("keyOriginBox"))) {
                    var bbox = origin.getObjectValue(stringIDToTypeID("keyOriginBox"));
                    // FIX B: getUnitDoubleValue returns raw points (PS internal).
                    // Convert pts → px: px = pts * (resolution / 72)
                    var ptsToPx = doc.resolution / 72;
                    l = unitDoubleToPx(boundsObj, "left", doc.resolution);
                    t = unitDoubleToPx(boundsObj, "top", doc.resolution);
                    r = unitDoubleToPx(boundsObj, "right", doc.resolution);
                    b = unitDoubleToPx(boundsObj, "bottom", doc.resolution);

                    var threshold = Math.max(docW, docH) * 1.5;
                    if (Math.abs(l) < threshold && Math.abs(t) < threshold && r < threshold * 2 && b < threshold * 2) {
                        return calculateBoundsObject(l, t, r, b, docW, docH);
                    }
                }
            }
        }
    } catch (e1) { }

    // Attempt 2: Selection-based (Pixel-perfect visual contents)
    // NOTE: PS transparency selection is clamped to the canvas area, so this gives
    // CLIPPED bounds for layers that extend outside the canvas. We only accept these
    // bounds if they do NOT touch the canvas edge — otherwise fall through to Attempt 3
    // which reads the actual layer descriptor without canvas clipping.
    try {
        doc.activeLayer = layer;
        var idsetd = charIDToTypeID("setd");
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
        desc.putReference(charIDToTypeID("null"), ref);
        var ref2 = new ActionReference();
        ref2.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("Trsp"));
        ref2.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("T   "), ref2);
        executeAction(idsetd, desc, DialogModes.NO);
        var selBounds = doc.selection.bounds;
        doc.selection.deselect();
        var sl = selBounds[0].as("px"), st = selBounds[1].as("px"),
            sr = selBounds[2].as("px"), sb2 = selBounds[3].as("px");
        // FIX 5: If the selection is flush with any canvas edge, the layer probably
        // extends beyond the canvas and the selection was silently cropped by PS.
        // In that case skip this result and use Attempt 3 (descriptor bounds).
        var EDGE_TOL = 2; // px tolerance for "flush with canvas edge"
        var touchesEdge = (sl <= EDGE_TOL || st <= EDGE_TOL ||
            sr >= docW - EDGE_TOL || sb2 >= docH - EDGE_TOL);
        if (touchesEdge) throw new Error("Selection flush with canvas edge — may be clipped");
        l = sl; t = st; r = sr; b = sb2;
    } catch (e) {
        // Attempt 3: ActionDescriptor 'bounds' (Includes effects/strokes)
        try {
            var ref = new ActionReference();
            ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
            var desc = executeActionGet(ref);
            var boundsObj = desc.getObjectValue(stringIDToTypeID("bounds"));
            // FIX C: Same pts→px conversion as Attempt 1
            var ptsToPx3 = doc.resolution / 72;
            l = unitDoubleToPx(boundsObj, "left", doc.resolution);
            t = unitDoubleToPx(boundsObj, "top", doc.resolution);
            r = unitDoubleToPx(boundsObj, "right", doc.resolution);
            b = unitDoubleToPx(boundsObj, "bottom", doc.resolution);

            // Sanity check for Attempt 3
            var threshold = Math.max(docW, docH) * 1.5;
            if (Math.abs(l) > threshold || Math.abs(t) > threshold || r > threshold * 2 || b > threshold * 2) {
                throw new Error("Extreme bounds in Attempt 3");
            }
        } catch (e2) {
            // Attempt 4: Standard layer bounds (Baseline fallback)
            l = layer.bounds[0].as("px"); t = layer.bounds[1].as("px"); r = layer.bounds[2].as("px"); b = layer.bounds[3].as("px");
        }
    }
    // Final Fallback for Icons/Logos: 
    // If we still have massive bounds for an icon, try to get tight bounds by rasterizing a copy.
    var role = getDetectedRole(layer.name);
    if ((role === "contact" || role === "logo") && (r - l >= docW - 2 && b - t >= docH - 2)) {
        try {
            var copy = layer.duplicate();
            copy.rasterize(RasterizeType.ENTIRELAYER);
            var rb = copy.bounds;
            copy.remove();

            var rl = rb[0].as("px"), rt = rb[1].as("px"), rr = rb[2].as("px"), rb_ = rb[3].as("px");
            if (rr - rl > 0 && rr - rl < docW * 0.9) {
                return calculateBoundsObject(rl, rt, rr, rb_, docW, docH);
            }
        } catch (eRaster) { }
    }

    return calculateBoundsObject(l, t, r, b, docW, docH);
}

function calculateBoundsObject(l, t, r, b, docW, docH) {
    // cx/cy/cw/ch = the VISIBLE portion on the canvas (for the selection-rect during export).
    // x/y/w/h     = the LOGICAL layer position (may extend outside canvas — that is intentional).
    // CRITICAL: Do NOT clamp x/y to canvas bounds here.
    // A stretched mask layer intentionally lives partly outside the canvas; its x/y must
    // stay as the true layer origin so the mobile renderer can position it correctly.
    var cx1 = Math.max(0, l), cy1 = Math.max(0, t);
    var cx2 = Math.min(docW, r), cy2 = Math.min(docH, b);
    var cw = Math.max(0, Math.ceil(cx2) - Math.floor(cx1));
    var ch = Math.max(0, Math.ceil(cy2) - Math.floor(cy1));
    return {
        x: formatDecimal(l), y: formatDecimal(t),
        w: formatDecimal(r - l), h: formatDecimal(b - t),
        cx: Math.floor(cx1), cy: Math.floor(cy1),
        cw: cw, ch: ch
    };
}

function getLayerContainerSafe(layer) {
    try { return layer.parent; } catch (e) { return app.activeDocument; }
}

function indexOfLayerInContainer(container, target) {
    try {
        for (var i = 0; i < container.layers.length; i++) if (container.layers[i] === target) return i;
    } catch (e) { }
    return -1;
}

function hasClippedLayersAboveGlobal(target) {
    try {
        if (CONFIG.IGNORE_CLIPPING_MASKS === true) return false;
        var container = getLayerContainerSafe(target);
        var idx = indexOfLayerInContainer(container, target);
        if (idx < 0) return false;
        for (var k = idx - 1; k >= 0; k--) {
            var up = container.layers[k];
            var isClipped = false;
            try { isClipped = (up.grouped === true); } catch (e1) { isClipped = false; }
            if (!isClipped) break;
            return true;
        }
    } catch (e2) { }
    return false;
}

function collectClippedStackGlobal(target) {
    if (CONFIG.IGNORE_CLIPPING_MASKS === true) return [target];
    var container = getLayerContainerSafe(target);
    var idx = indexOfLayerInContainer(container, target);
    if (idx < 0) return [target];

    var stack = [target];

    // If target is clipped, include base below (first non-clipped)
    try {
        if (target.grouped === true) {
            for (var j = idx + 1; j < container.layers.length; j++) {
                stack.push(container.layers[j]);
                if (container.layers[j].grouped !== true) break;
            }
        }
    } catch (e3) { }

    // Include clipped layers above target
    for (var k = idx - 1; k >= 0; k--) {
        var up = container.layers[k];
        var isClipped = false;
        try { isClipped = (up.grouped === true); } catch (e4) { isClipped = false; }
        if (!isClipped) break;
        stack.push(up);
    }

    return stack;
}

function unionBoundsForLayers(layers, docW, docH) {
    var minL = null, minT = null, maxR = null, maxB = null;
    for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        if (!l) continue;
        try {
            var b = getPreciseBounds(l, docW, docH);
            var left = b.x, top = b.y, right = b.x + b.w, bottom = b.y + b.h;
            if (minL === null || left < minL) minL = left;
            if (minT === null || top < minT) minT = top;
            if (maxR === null || right > maxR) maxR = right;
            if (maxB === null || bottom > maxB) maxB = bottom;
        } catch (e) { }
    }
    if (minL === null) return null;
    return calculateBoundsObject(minL, minT, maxR, maxB, docW, docH);
}

function exportChunkAsset(layers, name, folder, bounds) {
    // Export a pre-composited PNG for the given layer run.
    var activeDoc = app.activeDocument;
    var res = activeDoc.resolution;
    var tempDoc = app.documents.add(UnitValue(bounds.cw, "px"), UnitValue(bounds.ch, "px"), res, name, NewDocumentMode.RGB, DocumentFill.TRANSPARENT);

    function closeTemp() {
        if (tempDoc) {
            try { tempDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) { }
        }
    }

    function trimTempToNonTransparentPixels() {
        try {
            app.activeDocument = tempDoc;
            try { tempDoc.activeLayer = tempDoc.layers[0]; } catch (e0) { }
            var idsetd = charIDToTypeID("setd");
            var desc = new ActionDescriptor();
            var ref = new ActionReference();
            ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
            desc.putReference(charIDToTypeID("null"), ref);
            var ref2 = new ActionReference();
            ref2.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("Trsp"));
            ref2.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
            desc.putReference(charIDToTypeID("T   "), ref2);
            executeAction(idsetd, desc, DialogModes.NO);
            var sb = tempDoc.selection.bounds;
            tempDoc.selection.deselect();
            var left = sb[0].as("px");
            var top = sb[1].as("px");
            var right = sb[2].as("px");
            var bottom = sb[3].as("px");
            var w = right - left;
            var h = bottom - top;
            if (w <= 0 || h <= 0) return;
            tempDoc.crop([UnitValue(left, "px"), UnitValue(top, "px"), UnitValue(right, "px"), UnitValue(bottom, "px")]);
            // FIX 3: use bounds.cx/cy as the canvas-origin (not bounds.x/y which are logical/raw)
            bounds.x = formatDecimal(bounds.cx + left);
            bounds.y = formatDecimal(bounds.cy + top);
            bounds.w = formatDecimal(w);
            bounds.h = formatDecimal(h);
        } catch (e) {
            try { tempDoc.selection.deselect(); } catch (e2) { }
        }
    }

    function selectionRect(cx, cy, cw, ch) {
        var idsetd = charIDToTypeID("setd");
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
        desc.putReference(charIDToTypeID("null"), ref);
        var rectDesc = new ActionDescriptor();
        rectDesc.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), cx);
        rectDesc.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), cy);
        rectDesc.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), cx + cw);
        rectDesc.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), cy + ch);
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Rctn"), rectDesc);
        executeAction(idsetd, desc, DialogModes.NO);
    }

    function copyMergedAM() {
        executeAction(charIDToTypeID("CpyM"), undefined, DialogModes.NO);
    }

    function eachLayer(container, fn) {
        for (var i = 0; i < container.layers.length; i++) {
            var l = container.layers[i];
            fn(l);
            if (l.typename === "LayerSet") eachLayer(l, fn);
        }
    }

    function snapshotVisibility(doc) {
        var snap = [];
        eachLayer(doc, function (l) { snap.push({ id: l.id, visible: l.visible }); });
        return snap;
    }

    function restoreVisibility(doc, snap) {
        var map = {};
        for (var i = 0; i < snap.length; i++) map[snap[i].id] = snap[i].visible;
        eachLayer(doc, function (l) { if (map.hasOwnProperty(l.id)) l.visible = map[l.id]; });
    }

    var snap = null;
    try {
        snap = snapshotVisibility(activeDoc);
        // solo the layers in the stack
        eachLayer(activeDoc, function (l) { l.visible = false; });
        for (var s = 0; s < layers.length; s++) {
            var cur = layers[s];
            try { cur.visible = true; } catch (e3) { }
            try {
                var p = cur.parent;
                while (p && p.typename === "LayerSet") { p.visible = true; p = p.parent; }
            } catch (e4) { }
        }

        // Fidelity Guard: Check if we need to bake raster data (for shapes) or color data (for overlays)
        var needsRasterBake = false;
        if (layers.length === 1) {
            var lyr = layers[0];
            if (lyr.kind === LayerKind.SOLIDFILL || lyr.kind === LayerKind.GRADIENTFILL || isShapeLayer(lyr)) {
                needsRasterBake = true;
            }
        }

        var needsColorBake = false;
        var inherited = getInheritedGroupEffects(layers[0]);
        if (inherited.colorOverlay) {
            needsColorBake = true;
        }

        if (needsRasterBake || needsColorBake) {
            var tempCopy = layers[0].duplicate();

            // PIXEL GUARD: If the layer has no fill, give it 1% fill so Photoshop can "see" it
            try { if (tempCopy.fillOpacity < 1) tempCopy.fillOpacity = 1; } catch (eFill) { }

            if (needsColorBake) {
                applyColorOverlayToLayer(tempCopy, inherited.colorOverlay);
            }

            // OLD SCHOOL TRICK: Merge with a blank layer to bake "Shy Strokes"
            try {
                var dummy = app.activeDocument.artLayers.add();
                dummy.move(tempCopy, ElementPlacement.PLACEAFTER);
                tempCopy.merge(); // This turns tempCopy + dummy into a single raster layer with the stroke baked!
                tempCopy = app.activeDocument.activeLayer; // The merged layer becomes the new activeLayer
            } catch (eMerge) {
                try { tempCopy.rasterize(RasterizeType.ENTIRELAYER); } catch (eR) { }
            }
        }

        // NUCLEAR FIX: Force Photoshop to refresh and wait 100ms to ensure procedurals are rendered
        app.refresh();
        $.sleep(100);

        selectionRect(bounds.cx, bounds.cy, bounds.cw, bounds.ch);

        // STANDARD FIDELITY CAPTURE: copyMergedAM captures exactly what is visible within the selection.
        // This is safer for procedural shapes than direct layer copying.
        copyMergedAM();

        if (needsRasterBake || needsColorBake) {
            try { tempCopy.remove(); } catch (eRC) { }
        }

        try { activeDoc.selection.deselect(); } catch (eSel) { }

        app.activeDocument = tempDoc;
        tempDoc.paste();

        // Ensure the pasted content is at 0,0 in the temp doc
        var pb = tempDoc.activeLayer.bounds;
        var pxL = pb[0].as("px"), pxT = pb[1].as("px");
        tempDoc.activeLayer.translate(UnitValue(-pxL, "px"), UnitValue(-pxT, "px"));

        trimTempToNonTransparentPixels();

        // Save PNG with robust fallbacks (saveAs -> Save-for-Web -> Quick Export) + verification.
        var base = null;
        try { base = (folder && folder.fsName) ? folder.fsName : String(folder); } catch (eBase) { base = String(folder); }
        var outFile = new File(base + "\\" + name);
        try {
            tempDoc.saveAs(outFile, new PNGSaveOptions(), true, Extension.LOWERCASE);
        } catch (saveErr) {
            try {
                var opts = new ExportOptionsSaveForWeb();
                opts.format = SaveDocumentType.PNG;
                opts.PNG8 = false;
                opts.transparency = true;
                opts.interlaced = false;
                opts.quality = 100;
                tempDoc.exportDocument(outFile, ExportType.SAVEFORWEB, opts);
            } catch (webErr) {
                // Quick Export as PNG (works in some PS builds where saveAs/exportDocument fail)
                try {
                    var idExpr = stringIDToTypeID("exportSelectionAsFileTypePressed");
                    var d = new ActionDescriptor();
                    d.putInteger(stringIDToTypeID("fileType"), 2); // 2 = PNG
                    d.putPath(stringIDToTypeID("destFolder"), new Folder(base));
                    d.putString(stringIDToTypeID("fileName"), name.replace(/\.png$/i, ""));
                    d.putBoolean(stringIDToTypeID("openWindow"), false);
                    executeAction(idExpr, d, DialogModes.NO);
                } catch (qeErr) {
                    return null;
                }
            }
        }
        try {
            if (!outFile.exists) {
                var alt = new File(base + "\\" + name.toUpperCase());
                if (alt.exists) outFile = alt;
                else throw new Error("PNG not written: " + outFile.fsName);
            }
        } catch (verifyErr) {
            return null;
        }
        closeTemp();
        app.activeDocument = activeDoc;
        return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
    } catch (e) {
        pushRunError("export_chunk_failed", {
            chunkName: name,
            error: e.toString()
        });
        return null;
    } finally {
        // ⭐ STRONGER cleanup — always restore everything
        try { if (snap) restoreVisibility(activeDoc, snap); } catch (e3) { }
        try { activeDoc.selection.deselect(); } catch (e5) { }
        try { closeTemp(); } catch (e2) { }
        try { app.activeDocument = activeDoc; } catch (e4) { }
    }
}

function getLayerStyles(layer) {
    var s = {
        shadows: [],
        innerShadows: [],
        strokes: [],
        colorOverlay: null,
        gradientOverlay: null,
        outerGlow: null,
        innerGlow: null
    };
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        var lefxKey = stringIDToTypeID("layerEffects");
        var lefxChar = charIDToTypeID("Lefx");
        if (desc.hasKey(lefxKey) || desc.hasKey(lefxChar)) {
            var fxKey = desc.hasKey(lefxKey) ? lefxKey : lefxChar;
            var fx = desc.getObjectValue(fxKey);

            // Multi-Shadow extraction loop (DropShadow and DropShadowMulti candidates)
            var shadowKeys = ["dropShadow", "dropShadowMulti"];
            for (var j = 0; j < shadowKeys.length; j++) {
                var k = stringIDToTypeID(shadowKeys[j]);
                if (fx.hasKey(k)) {
                    var dsList = (shadowKeys[j] === "dropShadowMulti") ? fx.getList(k) : null;
                    var count = dsList ? dsList.count : 1;
                    for (var m = 0; m < count; m++) {
                        try {
                            var ds = dsList ? dsList.getObjectValue(m) : fx.getObjectValue(k);
                            if (ds.getBoolean(stringIDToTypeID("enabled"))) {
                                var c = ds.getObjectValue(stringIDToTypeID("color"));
                                s.shadows.push({
                                    color: hexFromDesc(c),
                                    blur: Math.round(ds.getUnitDoubleValue(stringIDToTypeID("blur"))),
                                    distance: Math.round(ds.getUnitDoubleValue(stringIDToTypeID("distance"))),
                                    opacity: formatDecimal(ds.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100),
                                    angle: Math.round(ds.getUnitDoubleValue(stringIDToTypeID("localLightingAngle"))),
                                    spread: Math.round(ds.getUnitDoubleValue(stringIDToTypeID("chokeMatte"))),
                                    blendMode: typeIDToStringID(ds.getEnumerationValue(stringIDToTypeID("mode"))),
                                    useGlobalLight: ds.hasKey(stringIDToTypeID("useGlobalAngle")) ? ds.getBoolean(stringIDToTypeID("useGlobalAngle")) : false
                                });
                            }
                        } catch (eDSInner) { }
                    }
                }
            }

            // Inner shadows loop
            var innerShadowKeys = ["innerShadow", "innerShadowMulti"];
            for (var j = 0; j < innerShadowKeys.length; j++) {
                var k = stringIDToTypeID(innerShadowKeys[j]);
                if (fx.hasKey(k)) {
                    var isList = (innerShadowKeys[j] === "innerShadowMulti") ? fx.getList(k) : null;
                    var count = isList ? isList.count : 1;
                    for (var m = 0; m < count; m++) {
                        try {
                            var isd = isList ? isList.getObjectValue(m) : fx.getObjectValue(k);
                            if (isd.getBoolean(stringIDToTypeID("enabled"))) {
                                var isc = isd.getObjectValue(stringIDToTypeID("color"));
                                s.innerShadows.push({
                                    color: hexFromDesc(isc),
                                    blur: Math.round(isd.getUnitDoubleValue(stringIDToTypeID("blur"))),
                                    distance: Math.round(isd.getUnitDoubleValue(stringIDToTypeID("distance"))),
                                    opacity: formatDecimal(isd.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100),
                                    angle: Math.round(isd.getUnitDoubleValue(stringIDToTypeID("localLightingAngle"))),
                                    spread: Math.round(isd.getUnitDoubleValue(stringIDToTypeID("chokeMatte"))),
                                    blendMode: typeIDToStringID(isd.getEnumerationValue(stringIDToTypeID("mode")))
                                });
                            }
                        } catch (eISInner) { }
                    }
                }
            }

            // Stroke (frameFX) - Multiple support
            var strokeKeys = ["frameFX", "frameFXMulti"];
            for (var j = 0; j < strokeKeys.length; j++) {
                var k = stringIDToTypeID(strokeKeys[j]);
                if (fx.hasKey(k)) {
                    var strList = (strokeKeys[j] === "frameFXMulti") ? fx.getList(k) : null;
                    var count = strList ? strList.count : 1;
                    for (var m = 0; m < count; m++) {
                        try {
                            var fr = strList ? strList.getObjectValue(m) : fx.getObjectValue(k);
                            if (fr.getBoolean(stringIDToTypeID("enabled"))) {
                                var frc = fr.getObjectValue(stringIDToTypeID("color"));
                                s.strokes.push({
                                    width: Math.round(fr.getUnitDoubleValue(stringIDToTypeID("size"))),
                                    color: hexFromDesc(frc),
                                    opacity: formatDecimal(fr.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100),
                                    position: typeIDToStringID(fr.getEnumerationValue(stringIDToTypeID("paintType"))).indexOf("inset") !== -1 ? "inside" : "outside"
                                });
                            }
                        } catch (eSTInner) { }
                    }
                }
            }

            // Color overlay
            try {
                if (fx.hasKey(stringIDToTypeID("colorOverlay")) && fx.getObjectValue(stringIDToTypeID("colorOverlay")).getBoolean(stringIDToTypeID("enabled"))) {
                    var co = fx.getObjectValue(stringIDToTypeID("colorOverlay"));
                    s.colorOverlay = {
                        color: hexFromDesc(co.getObjectValue(stringIDToTypeID("color"))),
                        opacity: formatDecimal(co.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100)
                    };
                }
            } catch (eCO) { }

            // Gradient overlay
            try {
                var gKey = stringIDToTypeID("gradientOverlay");
                var gChar = charIDToTypeID("GrFl");
                var goKey = fx.hasKey(gKey) ? gKey : (fx.hasKey(gChar) ? gChar : (fx.hasKey(stringIDToTypeID("gradientFill")) ? "gradientFill" : null));
                if (goKey) {
                    var go = fx.getObjectValue(typeof goKey === "string" ? stringIDToTypeID(goKey) : goKey);
                    if (go.getBoolean(stringIDToTypeID("enabled"))) {
                        s.gradientOverlay = {
                            opacity: formatDecimal(go.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100),
                            angle: go.hasKey(stringIDToTypeID("angle")) ? Math.round(go.getUnitDoubleValue(stringIDToTypeID("angle"))) : 90,
                            scale: go.hasKey(stringIDToTypeID("scale")) ? Math.round(go.getUnitDoubleValue(stringIDToTypeID("scale"))) : 100,
                            type: go.hasKey(stringIDToTypeID("type")) ? typeIDToStringID(go.getEnumerationValue(stringIDToTypeID("type"))) : "linear",
                            reverse: go.hasKey(stringIDToTypeID("reverse")) ? go.getBoolean(stringIDToTypeID("reverse")) : false,
                            align: go.hasKey(stringIDToTypeID("align")) ? go.getBoolean(stringIDToTypeID("align")) : true,
                            offset: go.hasKey(stringIDToTypeID("offset")) ? {
                                x: formatDecimal((go.getObjectValue(stringIDToTypeID("offset")).getUnitDoubleValue(stringIDToTypeID("horizontal")) + 50) / 100),
                                y: formatDecimal((go.getObjectValue(stringIDToTypeID("offset")).getUnitDoubleValue(stringIDToTypeID("vertical")) + 50) / 100)
                            } : { x: 0.5, y: 0.5 },
                            gradient: (go.hasKey(stringIDToTypeID("gradient")) || go.hasKey(charIDToTypeID("Grad")))
                                ? parseGradient(go.getObjectValue(go.hasKey(stringIDToTypeID("gradient")) ? stringIDToTypeID("gradient") : charIDToTypeID("Grad")))
                                : null
                        };
                    }
                }
            } catch (eGO) { }

            // Glows
            try {
                if (fx.hasKey(stringIDToTypeID("outerGlow")) && fx.getObjectValue(stringIDToTypeID("outerGlow")).getBoolean(stringIDToTypeID("enabled"))) {
                    var og = fx.getObjectValue(stringIDToTypeID("outerGlow"));
                    s.outerGlow = {
                        opacity: formatDecimal(og.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100),
                        size: Math.round(og.getUnitDoubleValue(stringIDToTypeID("blur"))),
                        spread: og.hasKey(stringIDToTypeID("chokeMatte")) ? Math.round(og.getUnitDoubleValue(stringIDToTypeID("chokeMatte"))) : 0,
                        blendMode: typeIDToStringID(og.getEnumerationValue(stringIDToTypeID("mode")))
                    };
                }
            } catch (eOG) { }
            try {
                if (fx.hasKey(stringIDToTypeID("innerGlow")) && fx.getObjectValue(stringIDToTypeID("innerGlow")).getBoolean(stringIDToTypeID("enabled"))) {
                    var ig = fx.getObjectValue(stringIDToTypeID("innerGlow"));
                    s.innerGlow = {
                        opacity: formatDecimal(ig.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100),
                        size: Math.round(ig.getUnitDoubleValue(stringIDToTypeID("blur"))),
                        spread: ig.hasKey(stringIDToTypeID("chokeMatte")) ? Math.round(ig.getUnitDoubleValue(stringIDToTypeID("chokeMatte"))) : 0,
                        blendMode: typeIDToStringID(ig.getEnumerationValue(stringIDToTypeID("mode")))
                    };
                }
            } catch (eIG) { }
        }
    } catch (e) { }
    return s;
}

function getLayerColor(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        // Priority 1: Color Overlay
        if (desc.hasKey(stringIDToTypeID("layerEffects"))) {
            var fx = desc.getObjectValue(stringIDToTypeID("layerEffects"));
            if (fx.hasKey(stringIDToTypeID("colorOverlay")) && fx.getObjectValue(stringIDToTypeID("colorOverlay")).getBoolean(stringIDToTypeID("enabled"))) {
                return hexFromDesc(fx.getObjectValue(stringIDToTypeID("colorOverlay")).getObjectValue(stringIDToTypeID("color")));
            }
        }

        // Priority 2: Adjustment Layers
        if (desc.hasKey(stringIDToTypeID("adjustment"))) {
            var adjArray = desc.getList(stringIDToTypeID("adjustment"));
            if (adjArray.count > 0) {
                var adj = adjArray.getObjectValue(0);
                if (adj.hasKey(stringIDToTypeID("color"))) return hexFromDesc(adj.getObjectValue(stringIDToTypeID("color")));
            }
        }

        // Priority 3: Gradient Overlay (Crucial for Text)
        if (desc.hasKey(stringIDToTypeID("layerEffects"))) {
            var fx = desc.getObjectValue(stringIDToTypeID("layerEffects"));
            var gKey = stringIDToTypeID("gradientOverlay");
            var gChar = charIDToTypeID("GrFl");
            var goKeyFound = fx.hasKey(gKey) ? gKey : (fx.hasKey(gChar) ? gChar : null);

            if (goKeyFound && fx.getObjectValue(goKeyFound).getBoolean(stringIDToTypeID("enabled"))) {
                var go = fx.getObjectValue(goKeyFound);
                layer._gradFill = {
                    gradient: parseGradient(go.getObjectValue(go.hasKey(stringIDToTypeID("gradient")) ? stringIDToTypeID("gradient") : charIDToTypeID("Grad"))),
                    opacity: formatDecimal(go.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100),
                    type: go.hasKey(stringIDToTypeID("type")) ? typeIDToStringID(go.getEnumerationValue(stringIDToTypeID("type"))) : "linear",
                    angle: go.hasKey(stringIDToTypeID("angle")) ? Math.round(go.getUnitDoubleValue(stringIDToTypeID("angle"))) : 90,
                    scale: go.hasKey(stringIDToTypeID("scale")) ? Math.round(go.getUnitDoubleValue(stringIDToTypeID("scale"))) : 100,
                    reverse: go.hasKey(stringIDToTypeID("reverse")) ? go.getBoolean(stringIDToTypeID("reverse")) : false,
                    align: go.hasKey(stringIDToTypeID("align")) ? go.getBoolean(stringIDToTypeID("align")) : true,
                    offset: go.hasKey(stringIDToTypeID("offset")) ? {
                        x: formatDecimal((go.getObjectValue(stringIDToTypeID("offset")).getUnitDoubleValue(stringIDToTypeID("horizontal")) + 50) / 100),
                        y: formatDecimal((go.getObjectValue(stringIDToTypeID("offset")).getUnitDoubleValue(stringIDToTypeID("vertical")) + 50) / 100)
                    } : { x: 0.5, y: 0.5 }
                };
                return null;
            }
        }

        // Priority 4: Standard Text Color (from Dominant Style)
        if (layer.kind === LayerKind.TEXT) {
            try {
                var dominantStyle = getDominantStyleObject(layer);
                if (dominantStyle && dominantStyle.hasKey(stringIDToTypeID("color"))) {
                    return hexFromDesc(dominantStyle.getObjectValue(stringIDToTypeID("color")));
                }
            } catch (eTextClr) { }
            return "#" + layer.textItem.color.rgb.hexValue;
        }

        // Priority 5: Fill descriptor
        if (desc.hasKey(stringIDToTypeID("fill"))) {
            var fill = desc.getObjectValue(stringIDToTypeID("fill"));
            if (fill.hasKey(stringIDToTypeID("color"))) return hexFromDesc(fill.getObjectValue(stringIDToTypeID("color")));
            if (fill.hasKey(stringIDToTypeID("gradient"))) {
                layer._gradFill = {
                    gradient: parseGradient(fill.getObjectValue(stringIDToTypeID("gradient"))),
                    type: fill.hasKey(stringIDToTypeID("type")) ? typeIDToStringID(fill.getEnumerationValue(stringIDToTypeID("type"))) : "linear",
                    angle: fill.hasKey(stringIDToTypeID("angle")) ? Math.round(fill.getUnitDoubleValue(stringIDToTypeID("angle"))) : 90,
                    scale: fill.hasKey(stringIDToTypeID("scale")) ? Math.round(fill.getUnitDoubleValue(stringIDToTypeID("scale"))) : 100,
                    reverse: fill.hasKey(stringIDToTypeID("reverse")) ? fill.getBoolean(stringIDToTypeID("reverse")) : false,
                    align: fill.hasKey(stringIDToTypeID("align")) ? fill.getBoolean(stringIDToTypeID("align")) : true,
                    offset: fill.hasKey(stringIDToTypeID("offset")) ? {
                        x: formatDecimal((fill.getObjectValue(stringIDToTypeID("offset")).getUnitDoubleValue(stringIDToTypeID("horizontal")) + 50) / 100),
                        y: formatDecimal((fill.getObjectValue(stringIDToTypeID("offset")).getUnitDoubleValue(stringIDToTypeID("vertical")) + 50) / 100)
                    } : { x: 0.5, y: 0.5 }
                };
                return null;
            }
        }
    } catch (e) { }
    return null;
}

function exportLayerAsset(layer, name, folder, bounds) {
    var activeDoc = app.activeDocument;
    var res = activeDoc.resolution;

    // TRANS_RECOVERY: If the layer name contains the force-transparency prefix,
    // we temporarily flip it to NORMAL blend mode and 100% opacity.
    // This allows us to export a clean transparent PNG asset while the JSON 
    // still tells the mobile app to apply "Color Burn" or "Multiply" at runtime.
    var originalBlend = null;
    var originalOpacity = null;
    var isTransForced = (layer.name.toLowerCase().indexOf(CONFIG.FORCE_TRANSPARENCY_PREFIX.toLowerCase()) !== -1);

    if (isTransForced) {
        try {
            originalBlend = layer.blendMode;
            originalOpacity = layer.opacity;
            layer.blendMode = BlendMode.NORMAL;
            layer.opacity = 100;
        } catch (eTrans) { isTransForced = false; }
    }

    var tempDoc = app.documents.add(UnitValue(bounds.cw, "px"), UnitValue(bounds.ch, "px"), res, name, NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
    app.activeDocument = activeDoc;

    function docSizePx(doc) {
        return { w: Math.round(doc.width.as("px")), h: Math.round(doc.height.as("px")) };
    }

    function unionBounds(items, docW, docH) {
        var minL = null, minT = null, maxR = null, maxB = null;
        for (var i = 0; i < items.length; i++) {
            var l = items[i];
            if (!l) continue;
            try {
                var b = getPreciseBounds(l, docW, docH);
                var left = b.x, top = b.y, right = b.x + b.w, bottom = b.y + b.h;
                if (minL === null || left < minL) minL = left;
                if (minT === null || top < minT) minT = top;
                if (maxR === null || right > maxR) maxR = right;
                if (maxB === null || bottom > maxB) maxB = bottom;
            } catch (e) { }
        }
        if (minL === null) return null;
        return calculateBoundsObject(minL, minT, maxR, maxB, docW, docH);
    }

    function appendToLog(msg) {
        try {
            var outFolder = folder;
            if (outFolder && outFolder.exists !== true) outFolder.create();
            var logPath = (outFolder && outFolder.fsName) ? (outFolder.fsName + SEP + "export_errors.txt") : (outFolder + SEP + "export_errors.txt");
            var lf = new File(logPath);
            lf.encoding = "UTF8";
            lf.open("a");
            lf.writeln("[" + isoDate() + "] " + msg);
            lf.close();
        } catch (e) { }
    }

    function closeTemp() {
        if (tempDoc) {
            try { tempDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) { }
        }
    }

    function trimTempToNonTransparentPixels() {
        // FIX 2: Always use transparency-aware trim for ANY layer whose exported temp
        // canvas equals the full canvas size. This catches stretched mask layers,
        // oversized Smart Objects, etc. — not only contact/logo/shape roles.
        try {
            var role = getDetectedRole(layer.name);
            var isShape = (layer.kind === LayerKind.SOLIDFILL || isShapeLayer(layer));
            var shouldTighten = (role === "contact" || role === "logo" || isShape);

            app.activeDocument = tempDoc;
            try { tempDoc.activeLayer = tempDoc.layers[0]; } catch (e0) { }

            var tdW = tempDoc.width.as("px");
            var tdH = tempDoc.height.as("px");

            // Select transparency of pasted content
            var idsetd = charIDToTypeID("setd");
            var desc = new ActionDescriptor();
            var ref = new ActionReference();
            ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
            desc.putReference(charIDToTypeID("null"), ref);
            var ref2 = new ActionReference();
            ref2.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("Trsp"));
            ref2.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
            desc.putReference(charIDToTypeID("T   "), ref2);
            executeAction(idsetd, desc, DialogModes.NO);

            var sb = tempDoc.selection.bounds;
            tempDoc.selection.deselect();

            var left = sb[0].as("px");
            var top = sb[1].as("px");
            var right = sb[2].as("px");
            var bottom = sb[3].as("px");
            var w = right - left;
            var h = bottom - top;

            if (w <= 0 || h <= 0) return;

            // FIX 2a: ANY layer whose temp canvas fills the full document width/height is
            // a candidate for aggressive trimming (not just icons/shapes).
            // A "stretched" clipping mask or background image will hit this condition.
            var isSuspiciouslyLarge = (w >= tdW - 1 || h >= tdH - 1);

            if (shouldTighten || isSuspiciouslyLarge) {
                // Pass 1: PS built-in transparent trim
                try {
                    tempDoc.trim(TrimType.TRANSPARENT, true, true, true, true);
                    var newW = tempDoc.width.as("px");
                    var newH = tempDoc.height.as("px");
                    if (newW < w) { w = newW; left = 0; right = w; }
                    if (newH < h) { h = newH; top = 0; bottom = h; }
                } catch (eTrim) { }

                // Pass 2: rasterize + trim (needed when the layer is a live Smart Object)
                if (w >= tempDoc.width.as("px") - 1 || h >= tempDoc.height.as("px") - 1) {
                    try {
                        tempDoc.activeLayer.rasterize(RasterizeType.ENTIRELAYER);
                        tempDoc.trim(TrimType.TRANSPARENT, true, true, true, true);
                        w = tempDoc.width.as("px");
                        h = tempDoc.height.as("px");
                        left = 0; top = 0;
                    } catch (eLast) { }
                }
            }

            // Crop the temp doc to the tight content bounds
            tempDoc.crop([UnitValue(left, "px"), UnitValue(top, "px"),
            UnitValue(left + w, "px"), UnitValue(top + h, "px")]);

            // FIX 2b: bounds.x/y must advance by the canvas-clipped offset (bounds.cx/cy)
            // PLUS the intra-canvas trim offset (left/top).
            // Previously: bounds.x += left  (lost the cx offset when bounds.cx > 0)
            bounds.x = formatDecimal(bounds.cx + left);
            bounds.y = formatDecimal(bounds.cy + top);
            bounds.w = formatDecimal(w);
            bounds.h = formatDecimal(h);
            bounds.cw = Math.round(w);
            bounds.ch = Math.round(h);
        } catch (e) {
            try { tempDoc.selection.deselect(); } catch (e2) { }
        }
    }

    function saveTemp() {
        var outFolder = folder;
        try { if (outFolder && outFolder.exists !== true) outFolder.create(); } catch (e0) { }

        var base = null;
        try { base = (outFolder && outFolder.fsName) ? outFolder.fsName : String(outFolder); } catch (e1) { base = String(outFolder); }
        var outFile = new File(base + SEP + name);

        // ⭐ CRITICAL: Ensure document supports transparency
        try {
            // Remove background layer if exists (background layers can't have transparency)
            if (tempDoc.backgroundLayer) {
                tempDoc.backgroundLayer.isBackgroundLayer = false;
            }
        } catch (eBG) { }

        // ⭐ Force RGB 8-bit (required for PNG transparency)
        try { tempDoc.bitsPerChannel = BitsPerChannelType.EIGHT; } catch (eBits) { }
        try { tempDoc.changeMode(ChangeMode.RGB); } catch (eMode) { }

        // ⭐ Use Save-for-Web FIRST (best transparency support)
        var saved = false;
        try {
            var webOpts = new ExportOptionsSaveForWeb();
            webOpts.format = SaveDocumentType.PNG;
            webOpts.PNG8 = false;          // PNG-24 for full alpha
            webOpts.transparency = true;    // ⭐ KEY: preserve transparency
            webOpts.interlaced = false;
            webOpts.quality = 100;
            webOpts.includeProfile = false;
            webOpts.optimized = true;

            tempDoc.exportDocument(outFile, ExportType.SAVEFORWEB, webOpts);
            saved = true;
        } catch (webErr) {
            // Fallback 1: saveAs PNG
            try {
                var pngOpts = new PNGSaveOptions();
                pngOpts.interlaced = false;
                pngOpts.compression = 6;
                tempDoc.saveAs(outFile, pngOpts, true, Extension.LOWERCASE);
                saved = true;
            } catch (saveErr) {
                // Fallback 2: Quick Export
                try {
                    var idExpr = stringIDToTypeID("exportSelectionAsFileTypePressed");
                    var d = new ActionDescriptor();
                    d.putInteger(stringIDToTypeID("fileType"), 2);
                    d.putPath(stringIDToTypeID("destFolder"), new Folder(base));
                    d.putString(stringIDToTypeID("fileName"), name.replace(/\.png$/i, ""));
                    d.putBoolean(stringIDToTypeID("openWindow"), false);
                    executeAction(idExpr, d, DialogModes.NO);
                    saved = true;
                } catch (qeErr) {
                    appendToLog(
                        "PNG save failed for '" + name + "': " +
                        "web=" + webErr.message + " save=" + saveErr.message + " quick=" + qeErr.message
                    );
                    throw webErr;
                }
            }
        }

        // Verify file exists
        try {
            if (!outFile.exists) {
                var alt = new File(base + SEP + name.toUpperCase());
                if (alt.exists) outFile = alt;
                else {
                    appendToLog("PNG missing after export for '" + name + "'");
                    throw new Error("PNG not written: " + outFile.fsName);
                }
            }
        } catch (verifyErr) {
            appendToLog("PNG verify failed for '" + name + "': " + verifyErr.message);
            throw verifyErr;
        }

        closeTemp();
        app.activeDocument = activeDoc;

        if (isTransForced) {
            try {
                layer.blendMode = originalBlend;
                layer.opacity = originalOpacity;
            } catch (eRestore) { }
        }

        return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
    }

    function selectionRect(cx, cy, cw, ch) {
        var idsetd = charIDToTypeID("setd");
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
        desc.putReference(charIDToTypeID("null"), ref);

        var rectDesc = new ActionDescriptor();
        rectDesc.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), cx);
        rectDesc.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), cy);
        rectDesc.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), cx + cw);
        rectDesc.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), cy + ch);
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Rctn"), rectDesc);
        executeAction(idsetd, desc, DialogModes.NO);
    }

    function copyMergedAM() {
        // Photoshop 2021 safe "Copy Merged"
        executeAction(charIDToTypeID("CpyM"), undefined, DialogModes.NO);
    }

    function eachLayer(container, fn) {
        for (var i = 0; i < container.layers.length; i++) {
            var l = container.layers[i];
            fn(l);
            if (l.typename === "LayerSet") eachLayer(l, fn);
        }
    }

    function snapshotVisibility(doc) {
        var snap = [];
        eachLayer(doc, function (l) { snap.push({ id: l.id, visible: l.visible }); });
        return snap;
    }

    function restoreVisibility(doc, snap) {
        var map = {};
        for (var i = 0; i < snap.length; i++) map[snap[i].id] = snap[i].visible;
        eachLayer(doc, function (l) { if (map.hasOwnProperty(l.id)) l.visible = map[l.id]; });
    }

    function getLayerContainer(layer) {
        try { return layer.parent; } catch (e) { return activeDoc; }
    }

    function indexOfLayer(container, target) {
        for (var i = 0; i < container.layers.length; i++) if (container.layers[i] === target) return i;
        return -1;
    }

    function hasClippedLayersAbove(target) {
        // If the layers directly above target are clipped (grouped === true),
        // the visible result depends on those layers. Duplicating the target alone
        // will export an incorrect silhouette (common with gradient/text clipping).
        try {
            if (CONFIG.IGNORE_CLIPPING_MASKS === true || CONFIG.BAKE_CLIPPING_MASKS === false) return false;
            var container = getLayerContainer(target);
            var idx = indexOfLayer(container, target);
            if (idx < 0) return false;
            // Above in panel = lower index
            for (var k = idx - 1; k >= 0; k--) {
                var up = container.layers[k];
                var isClipped = false;
                try { isClipped = (up.grouped === true); } catch (e) { isClipped = false; }
                if (!isClipped) break;
                return true;
            }
        } catch (e2) { }
        return false;
    }

    function collectClippedStack(target) {
        // For BAKE_CLIPPING_MASKS=false: return ONLY the image layer
        // We will unclip it temporarily to get full image
        // Do NOT include base — we don't want clipping applied
        if (CONFIG.BAKE_CLIPPING_MASKS === false) {
            return [target];
        }

        // Original logic for BAKE_CLIPPING_MASKS=true
        var container = getLayerContainer(target);
        var idx = indexOfLayer(container, target);
        if (idx < 0) return [target];

        var stack = [target];

        try {
            if (target.grouped === true) {
                for (var j = idx + 1; j < container.layers.length; j++) {
                    var below = container.layers[j];
                    var belowClipped = false;
                    try { belowClipped = (below.grouped === true); } catch (eb) { }
                    stack.push(below);
                    if (!belowClipped) break;
                }
            }
        } catch (e1) { }

        for (var k = idx - 1; k >= 0; k--) {
            var up = container.layers[k];
            var isClipped = false;
            try { isClipped = (up.grouped === true); } catch (e2) { isClipped = false; }
            if (!isClipped) break;
            stack.push(up);
        }

        return stack;
    }
    // Attempt 1: duplicate the layer into tempDoc (fastest)
    try {
        // Universal Smart Handling: If it's a Smart Object, duplication might loose filters
        // Forcing a copy-merged approach for high fidelity
        var isSmart = false;
        try { isSmart = (layer.kind === LayerKind.SMARTOBJECT); } catch (eS) { }

        // ── Attempt 1b: For clipped layers (BAKE_CLIPPING_MASKS=false),
        //    rasterize a temp copy in the SOURCE doc first, then duplicate that
        //    pixel layer to tempDoc. This guarantees valid pixel bounds.
        if (layer.grouped === true && CONFIG.BAKE_CLIPPING_MASKS === false) {
            var snap1b = null;
            try {
                app.activeDocument = activeDoc;

                var docW1b = activeDoc.width.as("px");
                var docH1b = activeDoc.height.as("px");

                // ── STEP 1: Find clipping base (shape) ────────────────────────
                var container1b = getLayerContainer(layer);
                var idx1b = indexOfLayer(container1b, layer);
                var baseLayer = null;

                for (var j = idx1b + 1; j < container1b.layers.length; j++) {
                    var candidate = container1b.layers[j];
                    var candidateClipped = false;
                    try { candidateClipped = (candidate.grouped === true); } catch (ec) { }
                    if (!candidateClipped) {
                        baseLayer = candidate;
                        break;
                    }
                }

                // ── STEP 2: Snapshot visibility ───────────────────────────────
                snap1b = snapshotVisibility(activeDoc);

                // ── STEP 3: Solo ONLY the image layer (hide everything else) ──
                // We hide base/shape too so copyMergedAM captures
                // the RAW full image without clipping applied
                eachLayer(activeDoc, function (l) { l.visible = false; });

                // Show ONLY the clipped image layer (NOT the base shape)
                layer.visible = true;

                // ── IMPORTANT: Temporarily UNCLIP the layer ───────────────────
                // So Photoshop renders it at FULL size without shape mask
                var wasGrouped = true;
                try {
                    layer.grouped = false; // Unclip = full image visible
                } catch (eUG) { }

                // Make parent groups visible
                try {
                    var p1b = layer.parent;
                    while (p1b && p1b.typename === "LayerSet") {
                        p1b.visible = true;
                        p1b = p1b.parent;
                    }
                } catch (ep1) { }

                // ── STEP 4: Get FULL image bounds (unclipped) ─────────────────
                var fullBounds = getPreciseBounds(layer, docW1b, docH1b);

                if (fullBounds.cw <= 0 || fullBounds.ch <= 0) {
                    // Re-clip before throwing
                    try { layer.grouped = true; } catch (eRG) { }
                    throw new Error("Attempt 1b: zero bounds on full image");
                }

                // ── STEP 5: Close old tempDoc, create new = FULL image size ───
                try { closeTemp(); } catch (eTmp1b) { }

                bounds = fullBounds; // ← Full image bounds, not shape bounds

                tempDoc = app.documents.add(
                    UnitValue(bounds.cw, "px"),
                    UnitValue(bounds.ch, "px"),
                    res,
                    name,
                    NewDocumentMode.RGB,
                    DocumentFill.TRANSPARENT
                );

                // ── STEP 6: Select full image area and copy merged ────────────
                app.activeDocument = activeDoc;
                activeDoc.activeLayer = layer;

                selectionRect(bounds.cx, bounds.cy, bounds.cw, bounds.ch);
                copyMergedAM(); // Captures full unclipped image
                try { activeDoc.selection.deselect(); } catch (eSD1b) { }

                // ── STEP 7: Re-clip the layer back immediately ─────────────────
                try { layer.grouped = true; } catch (eRG2) { }

                // ── STEP 8: Paste into tempDoc ────────────────────────────────
                app.activeDocument = tempDoc;
                tempDoc.paste();

                // Align pasted pixels to top-left
                var pb1b = tempDoc.activeLayer.bounds;
                var pxL1b = pb1b[0].as("px");
                var pxT1b = pb1b[1].as("px");
                tempDoc.activeLayer.translate(
                    UnitValue(-pxL1b, "px"),
                    UnitValue(-pxT1b, "px")
                );

                // ── STEP 9: Restore visibility ────────────────────────────────
                try { restoreVisibility(activeDoc, snap1b); } catch (eRV1b) { }
                snap1b = null;

                // ── STEP 10: Trim + Save ──────────────────────────────────────
                trimTempToNonTransparentPixels();
                return saveTemp();

            } catch (e1b) {
                appendToLog("Attempt 1b failed for '" + name + "': " + e1b.toString());
                // Re-clip if failed (safety)
                try { layer.grouped = true; } catch (eRGF) { }
                // Restore visibility
                try {
                    if (snap1b) restoreVisibility(activeDoc, snap1b);
                } catch (eRVF) { }
                // Fall through to Attempt 2
            }
        }

        var requiresFidelity = false;
        if (CONFIG.BAKE_CLIPPING_MASKS !== false) {
            if (isSmart || layer.grouped === true) requiresFidelity = true;
        } else {
            if (isSmart && layer.grouped !== true) requiresFidelity = true;
        }

        // SOLIDFILL and Live Shape layers (NORMAL kind with vector geometry) cannot be reliably
        // exported via direct duplication — they have no raster pixels when placed in a standalone
        // transparent document. They need copy-merged (Attempt 2) to render their fill/color correctly.
        if (!requiresFidelity) {
            try {
                var lyrKind = layer.kind;
                if (lyrKind === LayerKind.SOLIDFILL || lyrKind === LayerKind.GRADIENTFILL) {
                    requiresFidelity = true;
                } else if (lyrKind === LayerKind.NORMAL && isShapeLayer(layer)) {
                    requiresFidelity = true;
                }
            } catch (eKind) { }
        }
        if (requiresFidelity) throw new Error("High-fidelity required: use copy-merged");
        // Also force copy-merged when this layer is a clipping BASE (has clipped layers above).
        if (hasClippedLayersAbove(layer)) throw new Error("Clipping base: use copy-merged");
        layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);

        app.activeDocument = tempDoc;
        try { tempDoc.activeLayer = tempDoc.layers[0]; } catch (eSetLyr) { }
        try { tempDoc.activeLayer.grouped = false; } catch (eUngrp) { }

        // Translate the layer to (0,0) in tempDoc BEFORE rasterizing so it fits inside the canvas.
        // If we rasterize first, any parts of the layer outside the temp canvas are permanently cropped.
        tempDoc.activeLayer.translate(UnitValue(-bounds.cx, "px"), UnitValue(-bounds.cy, "px"));

        // Rasterize Smart Objects to bake filters into temp pixels.
        // Do NOT rasterize shape/fill layers unconditionally — SOLIDFILL layers
        // flood the entire canvas when rasterized without their vector mask context.
        if (isSmart) { try { tempDoc.activeLayer.rasterize(RasterizeType.ENTIRELAYER); } catch (eRast) { } }
        if (CONFIG.IGNORE_LAYER_MASKS === true) {
            try { disableMasksOnActiveLayer(); } catch (eMask1) { }
        }

        // Validate: check that the layer has real pixel bounds.
        // We use the simple DOM .bounds property which works on all Photoshop versions.
        // The previous Action Manager "Set" approach failed on many PS configurations.
        try {
            var lyrBounds = tempDoc.activeLayer.bounds;
            var sw = lyrBounds[2].as("px") - lyrBounds[0].as("px");
            var sh = lyrBounds[3].as("px") - lyrBounds[1].as("px");
            if (sw <= 0 || sh <= 0) throw new Error("Empty export: w=" + sw + ", h=" + sh);
        } catch (pxe) {
            appendToLog("Attempt 1 failed for layer '" + name + "': " + pxe.toString());
            throw pxe;
        }

        trimTempToNonTransparentPixels();
        return saveTemp();
    } catch (dupErr) {
        // Attempt 2: export rendered pixels (copy merged) with clipped-stack soloing
        // Attempt 2: export rendered pixels (copy merged) with clipped-stack soloing
        var snap = null;
        var maskSnap = null;
        var wasGrouped2 = false; // ← ADD THIS LINE ONLY

        try {
            app.activeDocument = activeDoc;
            snap = snapshotVisibility(activeDoc);

            var stack = collectClippedStack(layer);

            // ── ADD THIS BLOCK: Temporarily unclip for full image export ──────────
            if (CONFIG.BAKE_CLIPPING_MASKS === false && layer.grouped === true) {
                wasGrouped2 = true;
                try { layer.grouped = false; } catch (eUG2) { }
            }
            // ──────────────────────────────────────────────────────────────────────

            // Crop bounds should cover the whole clipped stack (or masked composite),
            // not just the target layer, otherwise exports get cut off or empty.
            try {
                var ds = docSizePx(activeDoc);
                var ub = unionBounds(stack, ds.w, ds.h);
                if (ub && ub.cw > 0 && ub.ch > 0) {
                    // ── CHANGE: If unclipped, recalculate with full image bounds ──
                    if (wasGrouped2) {
                        // Get full image bounds now that layer is unclipped
                        var fullBounds2 = getPreciseBounds(layer, ds.w, ds.h);
                        if (fullBounds2 && fullBounds2.cw > 0 && fullBounds2.ch > 0) {
                            ub = fullBounds2;
                        }
                    }
                    // ──────────────────────────────────────────────────────────────
                    try { closeTemp(); } catch (eTmp1) { }
                    bounds = ub;
                    tempDoc = app.documents.add(
                        UnitValue(bounds.cw, "px"),
                        UnitValue(bounds.ch, "px"),
                        res, name,
                        NewDocumentMode.RGB,
                        DocumentFill.TRANSPARENT
                    );
                    app.activeDocument = activeDoc;
                }
            } catch (eUB) { }

            if (CONFIG.IGNORE_LAYER_MASKS === true) {
                try {
                    maskSnap = snapshotMaskState(stack);
                    disableMasksForLayers(stack);
                } catch (eMask2) { maskSnap = null; }
            }

            eachLayer(activeDoc, function (l) { l.visible = false; });
            for (var s = 0; s < stack.length; s++) {
                var cur = stack[s];
                try { cur.visible = true; } catch (e3) { }
                try {
                    var p = cur.parent;
                    while (p && p.typename === "LayerSet") {
                        p.visible = true;
                        p = p.parent;
                    }
                } catch (e4) { }
            }

            activeDoc.activeLayer = layer;
            selectionRect(bounds.cx, bounds.cy, bounds.cw, bounds.ch);

            try {
                copyMergedAM();
            } catch (eCopy1) {
                try {
                    layer.rasterize(RasterizeType.ENTIRELAYER);
                    copyMergedAM();
                } catch (eCopy2) {
                    pushRunError("copy_merged_failed", {
                        layer: layer.name,
                        error: eCopy2.toString()
                    });
                    throw eCopy2;
                }
            }
            try { activeDoc.selection.deselect(); } catch (eSel2) { }

            // ── ADD THIS: Re-clip immediately after copy ───────────────────────────
            if (wasGrouped2) {
                try { layer.grouped = true; } catch (eRG3) { }
                wasGrouped2 = false; // Mark as restored
            }
            // ──────────────────────────────────────────────────────────────────────

            app.activeDocument = tempDoc;
            tempDoc.paste();

            var pb = tempDoc.activeLayer.bounds;
            var pxL = pb[0].as("px"), pxT = pb[1].as("px");
            tempDoc.activeLayer.translate(
                UnitValue(-pxL, "px"),
                UnitValue(-pxT, "px")
            );

            trimTempToNonTransparentPixels();
            return saveTemp();

        } catch (fallbackErr) {
            return null;
        } finally {
            // ── ADD THIS: Safety re-clip if something failed before we re-clipped ─
            if (wasGrouped2) {
                try { layer.grouped = true; } catch (eRGF) { }
            }
            // ──────────────────────────────────────────────────────────────────────

            // Your original finally block (NO CHANGES below)
            try { if (snap) restoreVisibility(activeDoc, snap); } catch (eVis) { }
            try { if (maskSnap) restoreMaskState(maskSnap); } catch (eMaskRestore) { }
            try { app.activeDocument = activeDoc; } catch (eDoc) { }
            try { activeDoc.selection.deselect(); } catch (eSel3) { }
            try { if (app.activeDocument !== activeDoc) app.activeDocument = activeDoc; } catch (eDoc2) { }
            try { closeTemp(); } catch (eClose) { }
        }
    }
}

function disableMasksOnActiveLayer() {
    // Works in most PS versions; best-effort (ignore failures).
    try {
        // Disable pixel (user) mask if present
        executeAction(stringIDToTypeID("disableLayerMask"), undefined, DialogModes.NO);
    } catch (e1) { }
    try {
        // Disable vector mask if present
        executeAction(stringIDToTypeID("disableVectorMask"), undefined, DialogModes.NO);
    } catch (e2) { }
    // Fallback: toggle layer descriptor flags (some builds need this)
    try {
        var layer = app.activeDocument.activeLayer;
        setMaskEnabledViaDescriptor(layer, "userMaskEnabled", false);
        setMaskEnabledViaDescriptor(layer, "vectorMaskEnabled", false);
    } catch (e3) { }
}

function snapshotMaskState(layers) {
    var snap = [];
    for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        try { snap.push({ id: l.id, user: getBoolKey(l, "userMaskEnabled"), vector: getBoolKey(l, "vectorMaskEnabled") }); }
        catch (e) { snap.push({ id: l.id, user: null, vector: null }); }
    }
    return snap;
}

function restoreMaskState(snap) {
    if (!snap) return;
    for (var i = 0; i < snap.length; i++) {
        var s = snap[i];
        if (!s || s.id === undefined) continue;
        try {
            var ref = new ActionReference();
            ref.putIdentifier(charIDToTypeID("Lyr "), s.id);
            var desc = executeActionGet(ref);
            // Only set if key exists in this build
            if (s.user !== null && desc.hasKey(stringIDToTypeID("userMaskEnabled"))) setMaskEnabledViaDescriptorId(s.id, "userMaskEnabled", s.user);
            if (s.vector !== null && desc.hasKey(stringIDToTypeID("vectorMaskEnabled"))) setMaskEnabledViaDescriptorId(s.id, "vectorMaskEnabled", s.vector);
        } catch (e1) { }
    }
}

function disableMasksForLayers(layers) {
    for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        try { setMaskEnabledViaDescriptor(l, "userMaskEnabled", false); } catch (e1) { }
        try { setMaskEnabledViaDescriptor(l, "vectorMaskEnabled", false); } catch (e2) { }
    }
}

function getBoolKey(layer, key) {
    var ref = new ActionReference();
    ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
    var desc = executeActionGet(ref);
    var tid = stringIDToTypeID(key);
    if (!desc.hasKey(tid)) return null;
    try { return desc.getBoolean(tid); } catch (e) { return null; }
}

function setMaskEnabledViaDescriptor(layer, key, enabled) {
    setMaskEnabledViaDescriptorId(layer.id, key, enabled);
}

function setMaskEnabledViaDescriptorId(layerId, key, enabled) {
    var idsetd = charIDToTypeID("setd");
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putIdentifier(charIDToTypeID("Lyr "), layerId);
    desc.putReference(charIDToTypeID("null"), ref);
    var desc2 = new ActionDescriptor();
    desc2.putBoolean(stringIDToTypeID(key), enabled);
    desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Lyr "), desc2);
    executeAction(idsetd, desc, DialogModes.NO);
}

function savePreview(doc, name, folder, quality) {
    var dup = doc.duplicate();
    try { dup.flatten(); } catch (e) { }
    dup.bitsPerChannel = BitsPerChannelType.EIGHT;
    var opts = new JPEGSaveOptions(); opts.quality = quality;
    dup.saveAs(new File(folder + SEP + name), opts, true, Extension.LOWERCASE);
    dup.close(SaveOptions.DONOTSAVECHANGES);
}

function getOutFolder() {
    if (typeof targetFolder !== "undefined") return targetFolder;
    return new Folder(Folder.desktop + "/batch_export_" + new Date().getTime());
}
function formatDecimal(val) { return Math.round(val * 100) / 100; }
function hexFromDesc(c) {
    if (!c) return "#000000";
    var color = new SolidColor();
    try {
        // Handle RGB
        if (c.hasKey(charIDToTypeID("Rd  "))) {
            color.rgb.red = c.getDouble(charIDToTypeID("Rd  "));
            color.rgb.green = c.getDouble(charIDToTypeID("Grn "));
            color.rgb.blue = c.getDouble(charIDToTypeID("Bl  "));
        }
        // Handle CMYK
        else if (c.hasKey(charIDToTypeID("Cyn "))) {
            color.cmyk.cyan = c.getDouble(charIDToTypeID("Cyn "));
            color.cmyk.magenta = c.getDouble(charIDToTypeID("Mgnt"));
            color.cmyk.yellow = c.getDouble(charIDToTypeID("Ylw "));
            color.cmyk.black = c.getDouble(charIDToTypeID("Blck"));
        }
        // Handle Lab
        else if (c.hasKey(charIDToTypeID("Lmnc"))) {
            color.lab.l = c.getDouble(charIDToTypeID("Lmnc"));
            color.lab.a = c.getDouble(charIDToTypeID("Am  "));
            color.lab.b = c.getDouble(charIDToTypeID("Bm  "));
        }
        // Handle HSB (Common in Gradient Editor)
        else if (c.hasKey(charIDToTypeID("H   "))) {
            color.hsb.hue = c.getDouble(charIDToTypeID("H   "));
            color.hsb.saturation = c.getDouble(charIDToTypeID("Strt"));
            color.hsb.brightness = c.getDouble(charIDToTypeID("Brgh"));
        }
        // Handle Grayscale
        else if (c.hasKey(charIDToTypeID("Gry "))) {
            color.gray.gray = c.getDouble(charIDToTypeID("Gry "));
        }
        else {
            return "#000000";
        }
        return "#" + color.rgb.hexValue;
    } catch (e) {
        // Fallback to basic RGB attempt if SolidColor object fails
        try {
            function p(h) {
                var val = Math.max(0, Math.min(255, Math.round(h))).toString(16);
                return val.length === 1 ? "0" + val : val;
            }
            if (c.hasKey(charIDToTypeID("Rd  "))) {
                return "#" + p(c.getDouble(charIDToTypeID("Rd  "))) + p(c.getDouble(charIDToTypeID("Grn "))) + p(c.getDouble(charIDToTypeID("Bl  ")));
            }
            if (c.hasKey(charIDToTypeID("H   "))) {
                var hsb = new SolidColor();
                hsb.hsb.hue = c.getDouble(charIDToTypeID("H   "));
                hsb.hsb.saturation = c.getDouble(charIDToTypeID("Strt"));
                hsb.hsb.brightness = c.getDouble(charIDToTypeID("Brgh"));
                return "#" + hsb.rgb.hexValue;
            }
        } catch (e2) { }
        return "#000000";
    }
}

function parseGradient(grad) {
    var res = {
        colors: [],
        opacities: [],
        type: "linear",
        interpolation: "linear",
        dither: false
    };
    if (!grad) return res;

    // Gradient Interpolation Mode (Modern PS: 'perceptual', 'linear', 'classic')
    try {
        if (grad.hasKey(stringIDToTypeID("interpolation"))) {
            res.interpolation = typeIDToStringID(grad.getEnumerationValue(stringIDToTypeID("interpolation")));
        }
    } catch (eInt) { }

    try {
        if (grad.hasKey(stringIDToTypeID("dither"))) {
            res.dither = grad.getBoolean(stringIDToTypeID("dither"));
        }
    } catch (eDith) { }

    // Color Stops
    var cKey = grad.hasKey(stringIDToTypeID("colors")) ? stringIDToTypeID("colors") : charIDToTypeID("Clrs");
    if (grad.hasKey(cKey)) {
        var clist = grad.getList(cKey);
        var maxLoc = 0;
        for (var k = 0; k < clist.count; k++) {
            var loc = clist.getObjectValue(k).getInteger(stringIDToTypeID("location"));
            if (loc > maxLoc) maxLoc = loc;
        }
        // Detection: PS uses 0-4096 historically, but some Newer versions/API paths use 0-100.
        var factor = (maxLoc > 100.1) ? 40.96 : 1.0;

        for (var i = 0; i < clist.count; i++) {
            var c = clist.getObjectValue(i);
            res.colors.push({
                color: hexFromDesc(c.getObjectValue(stringIDToTypeID("color"))),
                location: Math.round(c.getInteger(stringIDToTypeID("location")) * 100 / factor) / 100,
                midpoint: c.hasKey(stringIDToTypeID("midpoint")) ? c.getInteger(stringIDToTypeID("midpoint")) : 50
            });
        }
    }

    // Transparency Stops
    var tKey = grad.hasKey(stringIDToTypeID("transparency")) ? stringIDToTypeID("transparency") : charIDToTypeID("TrnS");
    if (grad.hasKey(tKey)) {
        var tlist = grad.getList(tKey);
        var maxTLoc = 0;
        for (var l = 0; l < tlist.count; l++) {
            var tloc = tlist.getObjectValue(l).getInteger(stringIDToTypeID("location"));
            if (tloc > maxTLoc) maxTLoc = tloc;
        }
        var tFactor = (maxTLoc > 100.1) ? 40.96 : 1.0;

        for (var j = 0; j < tlist.count; j++) {
            var t = tlist.getObjectValue(j);
            res.opacities.push({
                opacity: formatDecimal(t.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100),
                location: Math.round(t.getInteger(stringIDToTypeID("location")) * 100 / tFactor) / 100,
                midpoint: t.hasKey(stringIDToTypeID("midpoint")) ? t.getInteger(stringIDToTypeID("midpoint")) : 50
            });
        }
    }
    return res;
}
function getInheritedGroupEffects(layer) {
    var res = { opacity: 1.0, colorOverlay: null };
    try {
        var curr = layer.parent;
        // Traverse all the way up to the document root
        while (curr && curr.typename !== "Document") {
            if (curr.typename === "LayerSet") {
                // Combine opacities (multiply)
                res.opacity *= (curr.opacity / 100);

                // If we haven't found a color overlay yet, check this group
                if (!res.colorOverlay) {
                    var overlay = getGroupColorOverlay(curr);
                    if (overlay) res.colorOverlay = overlay;
                }
            }
            curr = curr.parent;
        }
    } catch (e) { }
    return res;
}

function getGroupColorOverlay(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        if (desc.hasKey(stringIDToTypeID("layerEffects"))) {
            var fx = desc.getObjectValue(stringIDToTypeID("layerEffects"));
            if (fx.hasKey(stringIDToTypeID("solidFill")) && fx.getObjectValue(stringIDToTypeID("solidFill")).getBoolean(stringIDToTypeID("enabled"))) {
                var sf = fx.getObjectValue(stringIDToTypeID("solidFill"));
                return hexFromDesc(sf.getObjectValue(stringIDToTypeID("color")));
            }
        }
    } catch (e) { }
    return null;
}

function applyColorOverlayToLayer(layer, hexColor) {
    try {
        app.activeDocument.activeLayer = layer;
        var idsetd = charIDToTypeID("setd");
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Prpr"), stringIDToTypeID("layerEffects"));
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);
        var desc2 = new ActionDescriptor();
        var desc3 = new ActionDescriptor();
        desc3.putBoolean(stringIDToTypeID("enabled"), true);
        desc3.putEnumerated(stringIDToTypeID("mode"), stringIDToTypeID("blendMode"), stringIDToTypeID("normal"));
        desc3.putUnitDoubleValue(stringIDToTypeID("opacity"), charIDToTypeID("#Prc"), 100.0);
        var desc4 = new ActionDescriptor();
        // Convert Hex to RGB for the ActionDescriptor
        var r = parseInt(hexColor.substring(1, 3), 16);
        var g = parseInt(hexColor.substring(3, 5), 16);
        var b = parseInt(hexColor.substring(5, 7), 16);
        desc4.putDouble(charIDToTypeID("Rd  "), r);
        desc4.putDouble(charIDToTypeID("Grn "), g);
        desc4.putDouble(charIDToTypeID("Bl  "), b);
        desc3.putObject(charIDToTypeID("Clr "), stringIDToTypeID("RGBColor"), desc4);
        desc2.putObject(stringIDToTypeID("solidFill"), stringIDToTypeID("solidFill"), desc3);
        desc.putObject(charIDToTypeID("T   "), stringIDToTypeID("layerEffects"), desc2);
        executeAction(idsetd, desc, DialogModes.NO);
    } catch (e) { }
}

function getDetectedRole(name) {
    var n = name.toLowerCase();
    // Priority 1: Module/Context Groups
    if (n.indexOf("footer") !== -1) return "footer";
    if (n.indexOf("header") !== -1) return "header";
    if (n.indexOf("sidebar") !== -1) return "sidebar";

    // Priority 2: Backgrounds
    if (n.indexOf("bg") !== -1 || n.indexOf("background") !== -1 || n.indexOf("base") !== -1) return "background";
    // Priority 3: Hero Assets
    if (n.indexOf("logo") !== -1 || n.indexOf("brand") !== -1) return "logo";
    if (n.indexOf("car") !== -1 || n.indexOf("vehicle") !== -1 || n.indexOf("product") !== -1 ||
        n.indexOf("photo") !== -1 || n.indexOf("banner") !== -1 || n.indexOf("hero") !== -1 ||
        n.indexOf("item") !== -1 || n.indexOf("model") !== -1) return "product";

    // Low Priority: Decorative elements
    if (n.indexOf("shadow") !== -1 || n.indexOf("glow") !== -1 || n.indexOf("dust") !== -1 ||
        n.indexOf("texture") !== -1 || n.indexOf("overlay") !== -1 || n.indexOf("light") !== -1) return "decorative";

    // Standard UI
    if (n.indexOf("phone") !== -1 || n.indexOf("pin") !== -1 || n.indexOf("location") !== -1 ||
        n.indexOf("map") !== -1 || n.indexOf("call") !== -1) return "contact";
    if (n.indexOf("placeholder") !== -1 || n.indexOf("asset") !== -1 || n.indexOf("image") !== -1) return "placeholder";

    return "content";
}

// Helper to determine if a layer belongs to a footer hierarchy
function isInsideFooter(layer) {
    try {
        var p = layer.parent;
        while (p && p.typename !== "Document") {
            if (getDetectedRole(p.name) === "footer") return true;
            p = p.parent;
        }
    } catch (e) { }
    return false;
}
function hasGradientFill(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        // Content layers (shapes) can have gradient fills that aren't exposed as "adjustment".
        try {
            if (desc.hasKey(stringIDToTypeID("contentLayer"))) {
                var cl = desc.getObjectValue(stringIDToTypeID("contentLayer"));
                if (cl.hasKey(stringIDToTypeID("type"))) {
                    var t = typeIDToStringID(cl.getEnumerationValue(stringIDToTypeID("type")));
                    if (t === "gradientLayer") return true;
                }
            }
        } catch (eCL) { }
        if (desc.hasKey(stringIDToTypeID("adjustment"))) {
            var adjArray = desc.getList(stringIDToTypeID("adjustment"));
            if (adjArray.count > 0) {
                var adj = adjArray.getObjectValue(0);
                return adj.hasKey(stringIDToTypeID("gradient"));
            }
        }
    } catch (e) { }
    return false;
}

function isShapeLayer(layer) {
    try {
        var k = layer.kind;
        // Smart Objects are rarely intended as mathematical shapes in this pipeline
        if (k === LayerKind.SMARTOBJECT) return false;

        // Native Shape or Fill adjustment layers with masks are shapes
        if (k === LayerKind.SOLIDFILL || k === LayerKind.GRADIENTFILL) return true;

        var ref = new ActionReference(); ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        // A "Normal" ArtLayer that has vector contentLayer or keyOriginType is a Live Shape
        var isNormalKind = false;
        try { isNormalKind = (k === LayerKind.NORMAL); } catch (ek) { }
        return isNormalKind && (desc.hasKey(stringIDToTypeID("contentLayer")) || desc.hasKey(stringIDToTypeID("keyOriginType")));
    } catch (e) { return false; }
}
function getShapeType(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        if (!desc.hasKey(stringIDToTypeID("keyOriginType"))) return "path";

        var typeList = desc.getList(stringIDToTypeID("keyOriginType"));
        if (typeList.count === 0) return "path";

        var origin = typeList.getObjectValue(0);

        // ── Method 1: Read keyOriginShapeType enum (most reliable) ────────
        try {
            var nameLower = (layer.name || "").toLowerCase();
            if (nameLower.indexOf("ellipse") !== -1 ||
                nameLower.indexOf("circle") !== -1 ||
                nameLower.indexOf("oval") !== -1) {
                return "circle";
            }
        } catch (eName) { }

        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        if (!desc.hasKey(stringIDToTypeID("keyOriginType"))) return "path";

        var typeList = desc.getList(stringIDToTypeID("keyOriginType"));
        if (typeList.count === 0) return "path";

        var origin = typeList.getObjectValue(0);

        // ── Method 2: Read keyOriginType enum ──
        try {
            if (origin.hasKey(stringIDToTypeID("keyOriginType"))) {
                var typeVal = origin.getEnumerationValue(stringIDToTypeID("keyOriginType"));
                var typeStr = typeIDToStringID(typeVal);

                if (typeStr.indexOf("ellipse") !== -1 ||
                    typeStr.indexOf("circle") !== -1) return "circle";
                if (typeStr.indexOf("rect") !== -1) return "rectangle";
                if (typeStr.indexOf("polygon") !== -1) return "polygon";
                if (typeStr.indexOf("line") !== -1) return "line";
            }
        } catch (eOrigType) { }

        // ── Method 3: Check keyOriginType as integer ──
        // PS enum: 1=rect, 2=rounded rect, 4=ellipse, 5=polygon, 6=line
        try {
            if (origin.hasKey(stringIDToTypeID("keyOriginType"))) {
                var typeInt = origin.getInteger(stringIDToTypeID("keyOriginType"));
                if (typeInt === 4) return "circle";
                if (typeInt === 1 || typeInt === 2) return "rectangle";
                if (typeInt === 5) return "polygon";
                if (typeInt === 6) return "line";
            }
        } catch (eInt) { }

        // ── Method 4: Read keyOriginShapeType enum (legacy) ──
        try {
            if (origin.hasKey(stringIDToTypeID("keyOriginShapeType"))) {
                var k = typeIDToStringID(
                    origin.getEnumerationValue(stringIDToTypeID("keyOriginShapeType"))
                );
                if (k.indexOf("ellipse") !== -1 || k.indexOf("circle") !== -1) return "circle";
                if (k.indexOf("rect") !== -1) return "rectangle";
                if (k.indexOf("line") !== -1) return "line";
                if (k.indexOf("polygon") !== -1) return "polygon";
            }
        } catch (eEnum) { }

        // ── Method 5: Has keyOriginRRectRadii = rounded rectangle ──
        if (origin.hasKey(stringIDToTypeID("keyOriginRRectRadii"))) {
            return "rectangle";
        }

        // ── Method 6: Detect circle from path data (analyze actual shape) ──
        try {
            if (desc.hasKey(stringIDToTypeID("vectorMask"))) {
                var vm = desc.getObjectValue(stringIDToTypeID("vectorMask"));
                var pathObj = vm.hasKey(stringIDToTypeID("path"))
                    ? vm.getObjectValue(stringIDToTypeID("path"))
                    : vm;

                if (pathObj.hasKey(stringIDToTypeID("pathComponents"))) {
                    var comps = pathObj.getList(stringIDToTypeID("pathComponents"));
                    if (comps.count > 0) {
                        var comp = comps.getObjectValue(0);
                        if (comp.hasKey(stringIDToTypeID("subpathListKey"))) {
                            var subs = comp.getList(stringIDToTypeID("subpathListKey"));
                            if (subs.count > 0) {
                                var sub = subs.getObjectValue(0);
                                if (sub.hasKey(stringIDToTypeID("points"))) {
                                    var points = sub.getList(stringIDToTypeID("points"));

                                    // Check if ALL points have curve handles (circle property)
                                    var allCurved = true;
                                    for (var pi = 0; pi < points.count; pi++) {
                                        var pt = points.getObjectValue(pi);
                                        var hasBoth = (pt.hasKey(stringIDToTypeID("forward")) &&
                                            pt.hasKey(stringIDToTypeID("backward")));
                                        if (!hasBoth) {
                                            allCurved = false;
                                            break;
                                        }
                                    }

                                    // Circles in PS typically have 4 anchor points all curved
                                    if (allCurved && points.count === 4) {
                                        return "circle";
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (ePath) { }

        // ── Method 7: Check box dimensions for square (likely circle) ──
        try {
            if (origin.hasKey(stringIDToTypeID("keyOriginBox"))) {
                var box = origin.getObjectValue(stringIDToTypeID("keyOriginBox"));
                var bL = box.getUnitDoubleValue(stringIDToTypeID("left"));
                var bT = box.getUnitDoubleValue(stringIDToTypeID("top"));
                var bR = box.getUnitDoubleValue(stringIDToTypeID("right"));
                var bB = box.getUnitDoubleValue(stringIDToTypeID("bottom"));
                var bW = Math.abs(bR - bL);
                var bH = Math.abs(bB - bT);

                if (bW > 0 && bH > 0) {
                    return "rectangle";
                }
            }
        } catch (eBox) { }

    } catch (e) { }
    return "path";
}


function getCornerRadius(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        if (!desc.hasKey(stringIDToTypeID("keyOriginType"))) return 0;

        var originList = desc.getList(stringIDToTypeID("keyOriginType"));
        if (originList.count === 0) return 0;

        var origin = originList.getObjectValue(0);
        if (!origin.hasKey(stringIDToTypeID("keyOriginRRectRadii"))) return 0;

        var radii = origin.getObjectValue(stringIDToTypeID("keyOriginRRectRadii"));
        var tl = Math.round(radii.getUnitDoubleValue(stringIDToTypeID("topLeft")));
        var tr = Math.round(radii.getUnitDoubleValue(stringIDToTypeID("topRight")));
        var bl = Math.round(radii.getUnitDoubleValue(stringIDToTypeID("bottomLeft")));
        var br = Math.round(radii.getUnitDoubleValue(stringIDToTypeID("bottomRight")));

        // ── Check transform on origin ─────────────────────────────────────
        var flipH = false, flipV = false, rot = 0;

        try {
            if (origin.hasKey(stringIDToTypeID("transform"))) {
                var t = origin.getObjectValue(stringIDToTypeID("transform"));
                var xx = t.getDouble(stringIDToTypeID("xx"));
                var xy = t.getDouble(stringIDToTypeID("xy"));
                var yy = t.getDouble(stringIDToTypeID("yy"));

                if (xx < 0) flipH = true;
                if (yy < 0) flipV = true;

                rot = Math.round(Math.atan2(xy, Math.abs(xx)) * 180 / Math.PI);
                while (rot < 0) rot += 360;
                rot = Math.round(rot / 90) * 90;
                if (rot === 360) rot = 0;
            }
        } catch (eT) { }

        // ── Also check layer-level transform ──────────────────────────────
        try {
            if (desc.hasKey(stringIDToTypeID("transform"))) {
                var lt = desc.getObjectValue(stringIDToTypeID("transform"));
                var lxx = lt.getDouble(stringIDToTypeID("xx"));
                var lxy = lt.getDouble(stringIDToTypeID("xy"));
                var lyy = lt.getDouble(stringIDToTypeID("yy"));

                if (lxx < 0) flipH = !flipH;
                if (lyy < 0) flipV = !flipV;

                var lrot = Math.round(Math.atan2(lxy, Math.abs(lxx)) * 180 / Math.PI);
                while (lrot < 0) lrot += 360;
                lrot = Math.round(lrot / 90) * 90;
                if (lrot === 360) lrot = 0;
                rot = (rot + lrot) % 360;
            }
        } catch (eLT) { }

        // ── Apply flip horizontally ──
        if (flipH) {
            var tmp1 = tl; tl = tr; tr = tmp1;
            var tmp2 = bl; bl = br; br = tmp2;
        }

        // ── Apply flip vertically ──
        if (flipV) {
            var tmp3 = tl; tl = bl; bl = tmp3;
            var tmp4 = tr; tr = br; br = tmp4;
        }

        // ── Apply rotation ──
        if (rot === 90) {
            var newTl90 = bl, newTr90 = tl, newBr90 = tr, newBl90 = br;
            tl = newTl90; tr = newTr90; br = newBr90; bl = newBl90;
        } else if (rot === 180) {
            var newTl180 = br, newTr180 = bl, newBr180 = tl, newBl180 = tr;
            tl = newTl180; tr = newTr180; br = newBr180; bl = newBl180;
        } else if (rot === 270) {
            var newTl270 = tr, newTr270 = br, newBr270 = bl, newBl270 = tl;
            tl = newTl270; tr = newTr270; br = newBr270; bl = newBl270;
        }

        // ── If transform didn't catch the rotation, detect from path ──────
        // Verify with actual path data if all 4 corners are still default
        if (rot === 0 && !flipH && !flipV) {
            // No transform detected — try path detection as backup
            var pathCorners = detectCornerRadiusFromPath(layer);
            if (pathCorners) {
                var maxR = Math.max(tl, tr, bl, br);
                if (maxR > 0) {
                    tl = pathCorners.tl ? maxR : 0;
                    tr = pathCorners.tr ? maxR : 0;
                    bl = pathCorners.bl ? maxR : 0;
                    br = pathCorners.br ? maxR : 0;
                }
            }
        }

        // Return single number if all corners are same
        if (tl === tr && tr === bl && bl === br) return tl;
        return { tl: tl, tr: tr, bl: bl, br: br };
    } catch (e) { }
    return 0;
}
function detectCornerRadiusFromPath(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        // Try vectorMask first, then contentLayer
        var pathSource = null;
        try {
            if (desc.hasKey(stringIDToTypeID("vectorMask"))) {
                pathSource = desc.getObjectValue(stringIDToTypeID("vectorMask"));
            }
        } catch (e1) { }

        if (!pathSource) {
            try {
                if (desc.hasKey(stringIDToTypeID("contentLayer"))) {
                    var cl = desc.getObjectValue(stringIDToTypeID("contentLayer"));
                    if (cl.hasKey(stringIDToTypeID("path"))) pathSource = cl;
                }
            } catch (e2) { }
        }

        if (!pathSource) return null;

        var pathObj = pathSource.hasKey(stringIDToTypeID("path"))
            ? pathSource.getObjectValue(stringIDToTypeID("path"))
            : pathSource;

        if (!pathObj.hasKey(stringIDToTypeID("pathComponents"))) return null;

        var comps = pathObj.getList(stringIDToTypeID("pathComponents"));
        if (comps.count === 0) return null;

        var comp = comps.getObjectValue(0);
        if (!comp.hasKey(stringIDToTypeID("subpathListKey"))) return null;

        var subs = comp.getList(stringIDToTypeID("subpathListKey"));
        if (subs.count === 0) return null;

        var sub = subs.getObjectValue(0);
        if (!sub.hasKey(stringIDToTypeID("points"))) return null;

        var points = sub.getList(stringIDToTypeID("points"));
        if (points.count < 4) return null;

        // Collect all anchor points + curve info
        var anchors = [];
        for (var i = 0; i < points.count; i++) {
            var pt = points.getObjectValue(i);
            try {
                var anchor = pt.getObjectValue(stringIDToTypeID("anchor"));
                var ax = anchor.getUnitDoubleValue(stringIDToTypeID("horizontal"));
                var ay = anchor.getUnitDoubleValue(stringIDToTypeID("vertical"));

                var hasCurve = false;
                try {
                    if (pt.hasKey(stringIDToTypeID("forward"))) {
                        var fwd = pt.getObjectValue(stringIDToTypeID("forward"));
                        var fx = fwd.getUnitDoubleValue(stringIDToTypeID("horizontal"));
                        var fy = fwd.getUnitDoubleValue(stringIDToTypeID("vertical"));
                        // If forward handle is different from anchor = curved
                        if (Math.abs(fx - ax) > 0.5 || Math.abs(fy - ay) > 0.5) {
                            hasCurve = true;
                        }
                    }
                } catch (eF) { }

                try {
                    if (pt.hasKey(stringIDToTypeID("backward"))) {
                        var back = pt.getObjectValue(stringIDToTypeID("backward"));
                        var bx = back.getUnitDoubleValue(stringIDToTypeID("horizontal"));
                        var by = back.getUnitDoubleValue(stringIDToTypeID("vertical"));
                        if (Math.abs(bx - ax) > 0.5 || Math.abs(by - ay) > 0.5) {
                            hasCurve = true;
                        }
                    }
                } catch (eB) { }

                anchors.push({ x: ax, y: ay, curved: hasCurve });
            } catch (ePoint) { }
        }

        if (anchors.length === 0) return null;

        // Find bounding box
        var minX = anchors[0].x, maxX = anchors[0].x;
        var minY = anchors[0].y, maxY = anchors[0].y;
        for (var j = 1; j < anchors.length; j++) {
            if (anchors[j].x < minX) minX = anchors[j].x;
            if (anchors[j].x > maxX) maxX = anchors[j].x;
            if (anchors[j].y < minY) minY = anchors[j].y;
            if (anchors[j].y > maxY) maxY = anchors[j].y;
        }

        var midX = (minX + maxX) / 2;
        var midY = (minY + maxY) / 2;

        // Group curved points by corner quadrant
        var result = { tl: false, tr: false, bl: false, br: false };

        for (var k = 0; k < anchors.length; k++) {
            var a = anchors[k];
            if (!a.curved) continue;

            var isLeft = a.x < midX;
            var isTop = a.y < midY;

            if (isLeft && isTop) result.tl = true;
            else if (!isLeft && isTop) result.tr = true;
            else if (isLeft && !isTop) result.bl = true;
            else result.br = true;
        }

        // Only return if at least one corner is curved
        if (result.tl || result.tr || result.bl || result.br) {
            return result;
        }

        return null;
    } catch (e) {
        return null;
    }
}
function getLayerRotation(layer) {
    try {
        var ref = new ActionReference(); ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);
        if (desc.hasKey(stringIDToTypeID("transform"))) {
            var t = desc.getObjectValue(stringIDToTypeID("transform"));
            var xx = t.getDouble(stringIDToTypeID("xx"));
            var xy = t.getDouble(stringIDToTypeID("xy"));
            var angle = Math.atan2(xy, xx) * 180 / Math.PI;
            return formatDecimal(angle);
        }
    } catch (e) { }
    return 0;
}
function getLayerStroke(layer) {
    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var desc = executeActionGet(ref);

        var stroke = null;

        // ── METHOD 1: Layer Effects (frameFX) — old approach ──
        try {
            if (desc.hasKey(stringIDToTypeID("layerEffects"))) {
                var fx = desc.getObjectValue(stringIDToTypeID("layerEffects"));
                if (fx.hasKey(stringIDToTypeID("frameFX")) &&
                    fx.getObjectValue(stringIDToTypeID("frameFX")).getBoolean(stringIDToTypeID("enabled"))) {
                    var s = fx.getObjectValue(stringIDToTypeID("frameFX"));
                    stroke = {
                        width: Math.round(s.getUnitDoubleValue(stringIDToTypeID("size"))),
                        color: hexFromDesc(s.getObjectValue(stringIDToTypeID("color"))),
                        opacity: s.hasKey(stringIDToTypeID("opacity"))
                            ? formatDecimal(s.getUnitDoubleValue(stringIDToTypeID("opacity")) / 100)
                            : 1
                    };
                }
            }
        } catch (eFx) { }

        if (stroke) return stroke;

        // ── METHOD 2: Vector Shape Stroke — for Live Shapes ──
        // This is what Photoshop uses when you set stroke in the top toolbar
        try {
            if (desc.hasKey(stringIDToTypeID("AGMStrokeStyleInfo"))) {
                var strokeInfo = desc.getObjectValue(stringIDToTypeID("AGMStrokeStyleInfo"));

                if (strokeInfo.hasKey(stringIDToTypeID("strokeEnabled")) &&
                    strokeInfo.getBoolean(stringIDToTypeID("strokeEnabled"))) {

                    var width = 0;
                    var color = "#000000";
                    var opacity = 1;

                    // Get stroke width
                    try {
                        if (strokeInfo.hasKey(stringIDToTypeID("strokeStyleLineWidth"))) {
                            width = Math.round(
                                strokeInfo.getUnitDoubleValue(stringIDToTypeID("strokeStyleLineWidth"))
                            );
                        }
                    } catch (eW) { }

                    // Get stroke color
                    try {
                        if (strokeInfo.hasKey(stringIDToTypeID("strokeStyleContent"))) {
                            var content = strokeInfo.getObjectValue(stringIDToTypeID("strokeStyleContent"));
                            if (content.hasKey(stringIDToTypeID("color"))) {
                                color = hexFromDesc(content.getObjectValue(stringIDToTypeID("color")));
                            }
                        }
                    } catch (eC) { }

                    // Get stroke opacity
                    try {
                        if (strokeInfo.hasKey(stringIDToTypeID("strokeStyleOpacity"))) {
                            opacity = formatDecimal(
                                strokeInfo.getUnitDoubleValue(stringIDToTypeID("strokeStyleOpacity")) / 100
                            );
                        }
                    } catch (eO) { }

                    if (width > 0) {
                        stroke = {
                            width: width,
                            color: color,
                            opacity: opacity,
                            type: "vector"
                        };
                    }
                }
            }
        } catch (eVec) { }

        if (stroke) return stroke;

    } catch (e) { }
    return null;
}
function getFontWeightNumeric(psName) {
    var n = psName.toLowerCase().replace(/[-_\s]/g, "");
    if (n.indexOf("thin") !== -1 || n.indexOf("w1") !== -1 || n.indexOf("hairline") !== -1) return "100";
    if (n.indexOf("extralight") !== -1 || n.indexOf("ultra-light") !== -1 || n.indexOf("w2") !== -1) return "200";
    if (n.indexOf("light") !== -1 || n.indexOf("w3") !== -1) return "300";
    if (n.indexOf("semibold") !== -1 || n.indexOf("demibold") !== -1 || n.indexOf("w6") !== -1 || n.indexOf("sb") !== -1) return "600";
    if (n.indexOf("bold") !== -1 || n.indexOf("w7") !== -1) return "700";
    if (n.indexOf("extrabold") !== -1 || n.indexOf("heavy") !== -1 || n.indexOf("w8") !== -1) return "800";
    if (n.indexOf("black") !== -1 || n.indexOf("ultra") !== -1 || n.indexOf("w9") !== -1) return "900";
    if (n.indexOf("medium") !== -1 || n.indexOf("w5") !== -1) return "500";
    return "400";
}
function getTextTransform(layer) {
    try {
        var ref = new ActionReference(); ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        var caps = typeIDToStringID(executeActionGet(ref).getObjectValue(stringIDToTypeID("textKey")).getList(stringIDToTypeID("textStyleRange")).getObjectValue(0).getObjectValue(stringIDToTypeID("textStyle")).getEnumerationValue(stringIDToTypeID("fontCaps")));
        return caps === "allCaps" ? "uppercase" : "none";
    } catch (e) { }
    return "none";
}
function isArtboard(layer) {
    try {
        var ref = new ActionReference(); ref.putIdentifier(charIDToTypeID("Lyr "), layer.id);
        return executeActionGet(ref).getBoolean(stringIDToTypeID("artboardEnabled"));
    } catch (e) { return false; }
}
function hasArtboards(doc) {
    try {
        var ref = new ActionReference(); ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        return executeActionGet(ref).hasKey(stringIDToTypeID("artboards"));
    } catch (e) { return false; }
}
function saveFinalJson(data, folder, ts) {
    var f = new File(folder + "/brandsLive_template_" + ts + ".json");
    f.encoding = "UTF8";
    f.open("w");
    f.write(jsonStringify(data, 2));
    f.close();
}

// ─── Single ZIP of the entire batch_export_ folder ───────────────────────────
// Creates ONE zip file containing every exported asset (PNGs, JPEGs, JSON)
// from inside the batch_export_<ts> folder.
// The zip is placed next to that folder (e.g. on the Desktop).
// Windows — requires PowerShell 5+ (ships with Windows 10 / PS 2016+).
// Mac     — falls back to the built-in `zip` command.
function createExportZip(folder, ts) {
    try {
        var isWin = ($.os && $.os.toLowerCase().indexOf("windows") !== -1);
        var sep = isWin ? "\\" : "/";
        var zipName = "batch_export_" + ts + ".zip";

        // Temporarily place the zip next to the folder to avoid recursion errors
        // (zipping a folder into a file that is inside that folder).
        var tempZipPath = folder.parent.fsName + sep + "__temp_" + ts + ".zip";
        var srcPath = folder.fsName;

        if (isWin) {
            // Write a temporary PowerShell script to sidestep cmd quoting issues.
            var psFile = new File(folder.parent.fsName + sep + "__zhelper_" + ts + ".ps1");
            psFile.encoding = "UTF8";
            psFile.open("w");
            // Compress-Archive zips everything (*) inside the source folder into one archive.
            psFile.writeln("Compress-Archive -Path '" + srcPath + "\\*' -DestinationPath '" + tempZipPath + "' -Force");
            psFile.close();

            // Execute via app.system — ExtendScript's host call that runs a shell command.
            app.system("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + psFile.fsName + "\"");

            // Remove the temporary helper script.
            try { psFile.remove(); } catch (eClean) { }
        } else {
            // Mac / Linux: use built-in zip.
            // -r  recursive, -j  junk (don't store dir structure inside zip)
            app.system("zip -r -j '" + tempZipPath + "' '" + srcPath + "'");
        }

        var tempFile = new File(tempZipPath);
        if (tempFile.exists) {
            // Move the zip inside the batch folder as requested
            var finalZipPath = folder.fsName + sep + zipName;
            var finalZipFile = new File(finalZipPath);

            if (finalZipFile.exists) finalZipFile.remove();
            tempFile.copy(finalZipFile);
            tempFile.remove();

            return finalZipFile.fsName;
        }
        return null;
    } catch (eZip) {
        return null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────

function pushRunError(type, payload) {
    try {
        RUN_ERRORS.push({
            time: isoDate(),
            type: type,
            payload: payload || {}
        });
    } catch (e) { }
}

function safeDocName(doc) {
    try { return doc && doc.name ? String(doc.name) : null; } catch (e) { return null; }
}

function safeLayerName(layer) {
    try { return layer && layer.name ? String(layer.name) : null; } catch (e) { return null; }
}

function safeLayerId(layer) {
    try { return layer && layer.id !== undefined ? layer.id : null; } catch (e) { return null; }
}

function writeRunErrorReportIfAny(folder, ts) {
    try {
        if (!RUN_ERRORS || RUN_ERRORS.length === 0) return;
        if (!folder) return;
        if (folder.exists !== true) try { folder.create(); } catch (e0) { }

        var jsonFile = new File(folder + "/brandsLive_template_" + ts + "_errors.json");
        jsonFile.encoding = "UTF8";
        jsonFile.open("w");
        jsonFile.write(jsonStringify({ ts: ts, errorCount: RUN_ERRORS.length, errors: RUN_ERRORS }, 2));
        jsonFile.close();

        var txtFile = new File(folder + "/brandsLive_template_" + ts + "_errors.txt");
        txtFile.encoding = "UTF8";
        txtFile.open("w");
        txtFile.writeln("Export error report");
        txtFile.writeln("Timestamp: " + ts);
        txtFile.writeln("Errors: " + RUN_ERRORS.length);
        txtFile.writeln("");
        for (var i = 0; i < RUN_ERRORS.length; i++) {
            var e = RUN_ERRORS[i];
            txtFile.writeln("[" + (e.time || "?") + "] " + (e.type || "error"));
            try { txtFile.writeln(fallbackStringify(e.payload)); } catch (e2) { txtFile.writeln(String(e.payload)); }
            txtFile.writeln("");
        }
        txtFile.close();
    } catch (e) { }
}

function jsonStringify(obj, space) {
    if (typeof JSON !== "undefined" && JSON.stringify) {
        return JSON.stringify(obj, null, space);
    }
    return fallbackStringify(obj);
}

function escapeJsonString(s) {
    return String(s).replace(/[\\"\u0000-\u001F]/g, function (c) {
        return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
    });
}

function fallbackStringify(obj) {
    if (obj === null) return "null";
    var t = typeof obj;
    if (t === "string") return "\"" + escapeJsonString(obj) + "\"";
    if (t === "number") return isFinite(obj) ? String(obj) : "null";
    if (t === "boolean") return obj ? "true" : "false";
    if (t !== "object") return "null";

    var isArr = (Object.prototype.toString.call(obj) === "[object Array]");
    var res = [];

    if (isArr) {
        for (var i = 0; i < obj.length; i++) {
            res.push(fallbackStringify(obj[i]));
        }
        return "[" + res.join(",") + "]";
    }

    for (var k in obj) {
        if (!obj.hasOwnProperty(k)) continue;
        res.push("\"" + escapeJsonString(k) + "\":" + fallbackStringify(obj[k]));
    }
    return "{" + res.join(",") + "}";
}

function toBase64(file) {
    if (!file || !file.exists) return null;
    try {
        file.encoding = "BINARY";
        file.open("r");
        var binary = file.read();
        file.close();

        var base64 = "";
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for (var i = 0; i < binary.length; i += 3) {
            var b1 = binary.charCodeAt(i) & 0xFF;
            var b2 = (i + 1 < binary.length) ? binary.charCodeAt(i + 1) & 0xFF : 0;
            var b3 = (i + 2 < binary.length) ? binary.charCodeAt(i + 2) & 0xFF : 0;

            var c1 = b1 >> 2;
            var c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
            var c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
            var c4 = b3 & 0x3F;

            base64 += chars.charAt(c1) + chars.charAt(c2);
            base64 += (i + 1 < binary.length) ? chars.charAt(c3) : "=";
            base64 += (i + 2 < binary.length) ? chars.charAt(c4) : "=";
        }
        return base64;
    } catch (e) { return null; }
}

function exportLayerMaskBase64(layer, folder, name) {
    if (!layer || !folder) return null;
    var activeDoc = app.activeDocument;
    var maskFile = new File(folder.fsName + SEP + name + "_mask.png");
    var result = null;

    try {
        // Create a temporary document for the mask
        var bounds = layer.bounds;
        var w = bounds[2].as("px") - bounds[0].as("px");
        var h = bounds[3].as("px") - bounds[1].as("px");
        if (w <= 0 || h <= 0) return null;

        var tempDoc = app.documents.add(UnitValue(w, "px"), UnitValue(h, "px"), activeDoc.resolution, "MaskTemp", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
        app.activeDocument = activeDoc;

        // Select mask channel
        try {
            var idsetd = charIDToTypeID("setd");
            var desc = new ActionDescriptor();
            var ref = new ActionReference();
            ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
            desc.putReference(charIDToTypeID("null"), ref);
            var ref2 = new ActionReference();
            ref2.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
            ref2.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
            desc.putReference(charIDToTypeID("T   "), ref2);
            executeAction(idsetd, desc, DialogModes.NO);

            executeAction(charIDToTypeID("CpyM"), undefined, DialogModes.NO);
            activeDoc.selection.deselect();

            app.activeDocument = tempDoc;
            tempDoc.paste();

            var opts = new PNGSaveOptions();
            tempDoc.saveAs(maskFile, opts, true, Extension.LOWERCASE);
            tempDoc.close(SaveOptions.DONOTSAVECHANGES);

            result = toBase64(maskFile);
            maskFile.remove();
        } catch (e) {
            if (tempDoc) tempDoc.close(SaveOptions.DONOTSAVECHANGES);
        }
    } catch (eTop) { }

    app.activeDocument = activeDoc;
    return result;
}

function duplicateLayerToNewDoc(layer, name, w, h) {
    var doc = app.documents.add(UnitValue(w, 'px'), UnitValue(h, 'px'), 72, name, NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
    app.activeDocument = layer.parent.parent;
    if (layer.parent.parent.typename !== 'Document') {
        // Need to find doc
        var d = layer; while (d.typename !== 'Document') d = d.parent;
        app.activeDocument = d;
    }
    layer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    return doc;
}
