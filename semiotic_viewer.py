#!/usr/bin/env python3
"""
semiotic_viewer.py — pattern collection viewer

Parses a patterns.json file exported from the Semiotic Pattern Builder
and renders each pattern using Tkinter (built into Python). Navigate with
arrow keys or click the buttons.

Usage:
    python3 semiotic_viewer.py patterns.json

Requirements:
    Python 3.8+, tkinter (included with most Python installations)
    On Linux: sudo apt install python3-tk  (if missing)
"""

import sys
import json
import math
import tkinter as tk
from tkinter import filedialog, messagebox
from pathlib import Path


# ── Pattern renderer ──────────────────────────────────────────────────────────
# Converts a pattern state dict into Tkinter canvas draw calls.
# Mirrors the logic in semiotic-pattern-builder.js exactly.

def hex_to_rgb(h):
    """CSS hex (#rrggbb) → (r, g, b) ints."""
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def _circle_poly(cx, cy, r, segments):
    """Approximate a circle as a polygon so it can be rotated/scaled like other shapes."""
    return [(cx + r * math.cos(2 * math.pi * k / segments),
             cy + r * math.sin(2 * math.pi * k / segments)) for k in range(segments)]


def _build_svg(st, w, h):
    """Build a self-contained SVG string at the given size (mirrors the JS engine)."""
    cx, cy = w / 2, h / 2
    sc = st.get('scale', 1.0)
    grot = st.get('rotation', 0)

    def pattern_def(pid, L, is_sec):
        t = L.get('type', 'none')
        if t == 'none':
            return '', ''
        color = L.get('color', '#fff')
        size = float(L.get('size', 24))
        sp = float(L.get('spacing', 24))
        rx = float(L.get('row_offset', 0)) * sp
        cyo = float(L.get('col_offset', 0)) * sp
        rot = L.get('rotation', grot)
        xf = f'rotate({rot} {cx} {cy}) translate({cx*(1-sc)} {cy*(1-sc)}) scale({sc})'
        if t == 'checkerboard':
            bgf = '' if is_sec else f'<rect width="{sp*2}" height="{sp*2}" fill="{st.get("bg","#121214")}"/>'
            body = (f'{bgf}<rect x="0" y="0" width="{sp}" height="{sp}" fill="{color}"/>'
                    f'<rect x="{sp}" y="{sp}" width="{sp}" height="{sp}" fill="{color}"/>')
            return (f'<pattern id="{pid}" width="{sp*2}" height="{sp*2}" '
                    f'patternUnits="userSpaceOnUse" patternTransform="{xf}">{body}</pattern>',
                    f'<rect width="{w}" height="{h}" fill="url(#{pid})"/>')
        tW = tH = sp * 2
        centres = [(sp/2, sp/2), (sp/2+sp, sp/2+cyo), (sp/2+rx, sp/2+sp), (sp/2+sp+rx, sp/2+sp+cyo)]
        offs = [(0, 0), (-tW, 0), (tW, 0), (0, -tH), (0, tH), (-tW, -tH), (tW, -tH), (-tW, tH), (tW, tH)]
        shapes = []
        if t == 'stripes':
            for bx in (sp/2, sp/2 + sp):
                for ox in (-tW, 0, tW):
                    shapes.append(f'<rect x="{bx+ox-size/2:.3f}" y="0" width="{size}" height="{tH}" fill="{color}"/>')
        else:
            for (bx, by) in centres:
                for (ox, oy) in offs:
                    x, y = bx + ox, by + oy
                    if t == 'circles':
                        shapes.append(f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{size/2}" fill="{color}"/>')
                    elif t == 'squares':
                        hh = size / 2
                        shapes.append(f'<rect x="{x-hh:.3f}" y="{y-hh:.3f}" width="{size}" height="{size}" fill="{color}"/>')
        return (f'<pattern id="{pid}" width="{tW}" height="{tH}" '
                f'patternUnits="userSpaceOnUse" patternTransform="{xf}">{"".join(shapes)}</pattern>',
                f'<rect width="{w}" height="{h}" fill="url(#{pid})"/>')

    d1, l1 = pattern_def('p1', st.get('s1', {}), False)
    d2, l2 = pattern_def('p2', st.get('s2', {}), True)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<defs>{d1}{d2}</defs>'
            f'<rect width="{w}" height="{h}" fill="{st.get("bg","#121214")}"/>{l1}{l2}</svg>')


def draw_pattern(canvas, state, w, h):
    """Render a full pattern state onto a Tk canvas of size w×h."""
    canvas.delete('all')
    bg = state.get('bg', '#121214')
    canvas.configure(bg=bg)

    grotation = state.get('rotation', 0)  # legacy global fallback
    scale    = state.get('scale', 1.0)

    for layer_key, is_secondary in [('s1', False), ('s2', True)]:
        layer = state.get(layer_key, {})
        ltype = layer.get('type', 'none')
        if ltype == 'none':
            continue

        color   = layer.get('color', '#ffffff')
        size    = layer.get('size', 24)
        spacing = layer.get('spacing', 24)
        rotation = layer.get('rotation', grotation)  # per-layer rotation
        row_off = layer.get('row_offset', 0)
        col_off = layer.get('col_offset', 0)

        # Build shapes in pattern-space (centred at canvas centre, no rotation/scale)
        # then transform each point.
        cx, cy = w / 2, h / 2
        sp = spacing
        rx = row_off * sp
        cyo = col_off * sp

        # How many tiles we need to cover the canvas even after rotation
        diag = math.ceil(math.sqrt(w * w + h * h))
        reach = math.ceil(diag / sp) + 4

        rad  = math.radians(rotation)
        cosr = math.cos(rad)
        sinr = math.sin(rad)

        def transform(px, py):
            """Rotate around centre, then scale around centre."""
            # Scale around centre first
            px = cx + (px - cx) * scale
            py = cy + (py - cy) * scale
            # Rotate around centre
            dx, dy = px - cx, py - cy
            nx = cx + dx * cosr - dy * sinr
            ny = cy + dx * sinr + dy * cosr
            return nx, ny

        if ltype == 'checkerboard':
            # Fill background first (primary only)
            if not is_secondary:
                canvas.create_rectangle(0, 0, w, h, fill=bg, outline='')

            # Draw foreground squares on a 2sp×2sp grid centred at canvas centre
            start_i = -reach
            start_j = -reach
            for i in range(start_i, reach + 1):
                for j in range(start_j, reach + 1):
                    # Checkerboard: draw where (i+j) is even
                    if (i + j) % 2 != 0:
                        continue
                    bx = cx + i * sp
                    by = cy + j * sp
                    corners = [(bx, by), (bx + sp, by), (bx + sp, by + sp), (bx, by + sp)]
                    pts = [transform(px, py) for px, py in corners]
                    flat = [c for pt in pts for c in pt]
                    canvas.create_polygon(flat, fill=color, outline='')
            continue

        # circles, squares, stripes.
        # The tile is 2sp × 2sp and contains FOUR shape centres (stagger encoded).
        # We iterate over tiles at 2sp steps and place all four centres in each,
        # exactly mirroring buildPatternDef in the JS engine.
        tW = sp * 2
        tH = sp * 2
        centres = [
            (sp / 2,            sp / 2),
            (sp / 2 + sp,       sp / 2 + cyo),
            (sp / 2 + rx,       sp / 2 + sp),
            (sp / 2 + sp + rx,  sp / 2 + sp + cyo),
        ]
        treach = math.ceil(diag / tW) + 2

        def draw_shape(bx, by):
            if ltype == 'circles':
                pts = _circle_poly(bx, by, size / 2, 24)
                flat = [c for pt in (transform(px, py) for px, py in pts) for c in pt]
                canvas.create_polygon(flat, fill=color, outline='')
            elif ltype == 'squares':
                h2 = size / 2
                corners = [(bx-h2, by-h2), (bx+h2, by-h2), (bx+h2, by+h2), (bx-h2, by+h2)]
                flat = [c for pt in (transform(px, py) for px, py in corners) for c in pt]
                canvas.create_polygon(flat, fill=color, outline='')

        if ltype == 'stripes':
            # Vertical stripes: two per 2sp tile (at sp/2 and sp/2+sp), tiled across.
            for ti in range(-treach, treach + 1):
                base_x = cx + ti * tW
                for sx in (sp / 2, sp / 2 + sp):
                    bx = base_x + (sx - sp)   # centre the tile on canvas centre
                    half = size / 2
                    corners = [(bx-half, cy-diag), (bx+half, cy-diag),
                               (bx+half, cy+diag), (bx-half, cy+diag)]
                    flat = [c for pt in (transform(px, py) for px, py in corners) for c in pt]
                    canvas.create_polygon(flat, fill=color, outline='')
        else:
            for ti in range(-treach, treach + 1):
                for tj in range(-treach, treach + 1):
                    ox = cx + ti * tW - sp   # tile origin, centred on canvas
                    oy = cy + tj * tH - sp
                    for (sx, sy) in centres:
                        bx = ox + sx
                        by = oy + sy
                        if abs(bx - cx) > diag + tW or abs(by - cy) > diag + tH:
                            continue
                        draw_shape(bx, by)


# ── UI ────────────────────────────────────────────────────────────────────────

class PatternViewer:
    SIZE = 600

    def __init__(self, root, patterns):
        self.root     = root
        self.patterns = patterns
        self.idx      = 0

        root.title('Semiotic Pattern Viewer')
        root.configure(bg='#0c0c10')
        root.resizable(True, True)

        # Canvas
        self.canvas = tk.Canvas(root, width=self.SIZE, height=self.SIZE,
                                highlightthickness=0, bd=0)
        self.canvas.pack(fill='both', expand=True, padx=12, pady=(12, 6))

        # Info label
        self.info = tk.Label(root, text='', fg='#9090aa', bg='#0c0c10',
                             font=('system', 10))
        self.info.pack(pady=(0, 4))

        # Controls
        ctrl = tk.Frame(root, bg='#0c0c10')
        ctrl.pack(pady=(0, 12))

        btn_cfg = dict(bg='#1e1e28', fg='#e2e2ee', activebackground='#6366f1',
                       activeforeground='#fff', relief='flat', padx=14, pady=6,
                       font=('system', 11), cursor='hand2', bd=0)

        tk.Button(ctrl, text='◀  Prev', command=self.prev, **btn_cfg).pack(side='left', padx=4)
        tk.Button(ctrl, text='⟳  Shuffle', command=self.shuffle, **btn_cfg).pack(side='left', padx=4)
        tk.Button(ctrl, text='Next  ▶', command=self.next, **btn_cfg).pack(side='left', padx=4)

        # Export controls: width × height + Save Image
        exp = tk.Frame(root, bg='#0c0c10')
        exp.pack(pady=(0, 14))

        lbl_cfg = dict(bg='#0c0c10', fg='#9090aa', font=('system', 10))
        ent_cfg = dict(bg='#1e1e28', fg='#e2e2ee', insertbackground='#e2e2ee',
                       relief='flat', width=6, font=('system', 11), justify='center')

        tk.Label(exp, text='Export size:', **lbl_cfg).pack(side='left', padx=(0, 6))
        self.w_var = tk.StringVar(value='1000')
        self.h_var = tk.StringVar(value='1000')
        tk.Entry(exp, textvariable=self.w_var, **ent_cfg).pack(side='left')
        tk.Label(exp, text='×', **lbl_cfg).pack(side='left', padx=4)
        tk.Entry(exp, textvariable=self.h_var, **ent_cfg).pack(side='left', padx=(0, 8))
        tk.Button(exp, text='💾  Save Image', command=self.save_image, **btn_cfg).pack(side='left', padx=4)

        # Keyboard
        root.bind('<Left>',  lambda e: self.prev())
        root.bind('<Right>', lambda e: self.next())
        root.bind('<space>', lambda e: self.shuffle())
        root.bind('<Configure>', self._on_resize)

        self._draw()

    def _on_resize(self, event):
        # Only re-render when the canvas actually changes size
        if event.widget is self.canvas:
            self._draw()

    def _draw(self):
        w = self.canvas.winfo_width()  or self.SIZE
        h = self.canvas.winfo_height() or self.SIZE
        st = self.patterns[self.idx]
        draw_pattern(self.canvas, st, w, h)
        total = len(self.patterns)
        s1 = st.get('s1', {}).get('type', '?')
        s2 = st.get('s2', {}).get('type', 'none')
        self.info.config(text=f'Pattern {self.idx + 1} of {total}  ·  {s1} / {s2}  ·  ← → to navigate  ·  space to shuffle')

    def prev(self):
        self.idx = (self.idx - 1) % len(self.patterns)
        self._draw()

    def next(self):
        self.idx = (self.idx + 1) % len(self.patterns)
        self._draw()

    def shuffle(self):
        import random
        self.idx = random.randrange(len(self.patterns))
        self._draw()

    def save_image(self):
        from tkinter import filedialog, messagebox
        # Parse requested dimensions
        try:
            w = max(1, int(float(self.w_var.get())))
            h = max(1, int(float(self.h_var.get())))
        except ValueError:
            messagebox.showerror('Invalid size', 'Width and height must be numbers.')
            return

        st = self.patterns[self.idx]

        # Try PNG via Pillow; fall back to SVG if Pillow isn't installed.
        try:
            from PIL import Image  # noqa: F401
            have_pillow = True
        except ImportError:
            have_pillow = False

        if have_pillow:
            path = filedialog.asksaveasfilename(
                title='Save image', defaultextension='.png',
                initialfile=f'pattern_{self.idx + 1}.png',
                filetypes=[('PNG image', '*.png'), ('SVG vector', '*.svg')])
            if not path:
                return
            if path.lower().endswith('.svg'):
                self._save_svg(st, path, w, h)
            else:
                self._save_png(st, path, w, h)
        else:
            path = filedialog.asksaveasfilename(
                title='Save image (SVG — install Pillow for PNG)',
                defaultextension='.svg',
                initialfile=f'pattern_{self.idx + 1}.svg',
                filetypes=[('SVG vector', '*.svg')])
            if not path:
                return
            self._save_svg(st, path, w, h)
        messagebox.showinfo('Saved', f'Saved to:\n{path}')

    def _save_png(self, st, path, w, h):
        """Render the pattern to a PNG by drawing onto a Pillow image."""
        from PIL import Image, ImageDraw

        def hx(c):
            c = c.lstrip('#').strip()
            if len(c) == 3:
                c = ''.join(ch * 2 for ch in c)
            if len(c) != 6:
                return (128, 128, 128)
            try:
                return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
            except ValueError:
                return (128, 128, 128)

        img = Image.new('RGB', (w, h), hx(st.get('bg', '#121214')))
        draw = ImageDraw.Draw(img)
        cx, cy = w / 2, h / 2
        sc = st.get('scale', 1.0)
        grot = st.get('rotation', 0)
        diag = math.ceil(math.sqrt(w * w + h * h))

        for key in ('s1', 's2'):
            L = st.get(key, {})
            t = L.get('type', 'none')
            if t == 'none':
                continue
            col = hx(L.get('color', '#ffffff'))
            size = float(L.get('size', 24))
            sp = float(L.get('spacing', 24))
            rx = float(L.get('row_offset', 0)) * sp
            cyo = float(L.get('col_offset', 0)) * sp
            rot = math.radians(L.get('rotation', grot))
            cosr, sinr = math.cos(rot), math.sin(rot)

            def tf(px, py):
                px = cx + (px - cx) * sc
                py = cy + (py - cy) * sc
                dx, dy = px - cx, py - cy
                return (cx + dx * cosr - dy * sinr, cy + dx * sinr + dy * cosr)

            if t == 'checkerboard':
                reach = math.ceil(diag / sp) + 4
                for i in range(-reach, reach + 1):
                    for j in range(-reach, reach + 1):
                        if (i + j) % 2 != 0:
                            continue
                        bx, by = cx + i * sp, cy + j * sp
                        draw.polygon([tf(bx, by), tf(bx + sp, by),
                                      tf(bx + sp, by + sp), tf(bx, by + sp)], fill=col)
                continue

            tW = tH = sp * 2
            centres = [(sp/2, sp/2), (sp/2 + sp, sp/2 + cyo),
                       (sp/2 + rx, sp/2 + sp), (sp/2 + sp + rx, sp/2 + sp + cyo)]
            treach = math.ceil(diag / tW) + 2
            if t == 'stripes':
                for ti in range(-treach, treach + 1):
                    base = cx + ti * tW
                    for sx in (sp/2, sp/2 + sp):
                        bx = base + (sx - sp)
                        half = size / 2
                        draw.polygon([tf(bx-half, cy-diag), tf(bx+half, cy-diag),
                                      tf(bx+half, cy+diag), tf(bx-half, cy+diag)], fill=col)
            else:
                for ti in range(-treach, treach + 1):
                    for tj in range(-treach, treach + 1):
                        ox = cx + ti * tW - sp
                        oy = cy + tj * tH - sp
                        for (sx, sy) in centres:
                            bx, by = ox + sx, oy + sy
                            if abs(bx - cx) > diag + tW or abs(by - cy) > diag + tH:
                                continue
                            if t == 'circles':
                                draw.polygon([tf(px, py) for px, py in
                                              _circle_poly(bx, by, size/2, 24)], fill=col)
                            elif t == 'squares':
                                h2 = size / 2
                                draw.polygon([tf(px, py) for px, py in
                                              [(bx-h2, by-h2), (bx+h2, by-h2),
                                               (bx+h2, by+h2), (bx-h2, by+h2)]], fill=col)
        img.save(path)

    def _save_svg(self, st, path, w, h):
        """Write a self-contained SVG at the requested size."""
        with open(path, 'w') as f:
            f.write(_build_svg(st, w, h))


# ── Entry point ───────────────────────────────────────────────────────────────

def load_file(path):
    """Load patterns from a .json file. Returns list of state dicts."""
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    # Single pattern
    return [data]


def main():
    path = None

    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
        if not path.exists():
            print(f'File not found: {path}', file=sys.stderr)
            sys.exit(1)

    root = tk.Tk()
    root.withdraw()  # hide until we have patterns

    if path is None:
        path = filedialog.askopenfilename(
            title='Open pattern collection',
            filetypes=[('JSON collection', '*.json'), ('All files', '*.*')]
        )
        if not path:
            sys.exit(0)
        path = Path(path)

    try:
        patterns = load_file(path)
    except Exception as e:
        messagebox.showerror('Error', f'Could not load {path.name}:\n{e}')
        sys.exit(1)

    if not patterns:
        messagebox.showinfo('Empty', 'No patterns found in file.')
        sys.exit(0)

    root.deiconify()
    PatternViewer(root, patterns)
    root.mainloop()


if __name__ == '__main__':
    main()
