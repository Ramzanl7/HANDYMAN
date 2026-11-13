#!/usr/bin/env python3
"""Branded 3D QR sticker for Handyman. Outputs print/qr.svg and print/qr-sticker.html (rendered to PNG/PDF by tools/render_qr.js)."""
import segno, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "HTTPS://HANDYMAN-GROZNY.VERCEL.APP/QR"   # upper case -> compact alphanumeric QR; /QR redirects to the site
qr = segno.make(URL, error="h", micro=False)
M = [list(r) for r in qr.matrix]; N = len(M)
INK, SIDE, PAPER, YEL, SHADOW = "#1d2a44", "#0c1426", "#fffdf6", "#ffd400", "#e9e2cd"
S = 20                    # module size in svg units
RX = float(os.environ.get("QR_RX", "5")); FR = float(os.environ.get("QR_FR", "0.9")); PR = float(os.environ.get("QR_PR", "0.6")); SHADOWS = os.environ.get("QR_SH", "1") == "1"; LOGO = os.environ.get("QR_LOGO", "1") == "1"
Q = 4                     # quiet zone (modules)
D = float(os.environ.get("QR_D", "2.5"))   # extrusion depth
W = (N + 2 * Q) * S
logo_mods = 9             # center hole size (modules), ~ (9*9)/(N*N) of the area
c0 = (N - logo_mods) // 2
def in_finder(r, c): return (r < 7 and c < 7) or (r < 7 and c >= N - 7) or (r >= N - 7 and c < 7)
def in_logo(r, c): return LOGO and c0 <= r < c0 + logo_mods and c0 <= c < c0 + logo_mods
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}">',
  '<defs><linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3d61"/><stop offset="1" stop-color="#1d2a44"/></linearGradient>'
  '<linearGradient id="bub" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8e4da"/></linearGradient></defs>',
  f'<rect width="{W}" height="{W}" rx="{S*FR}" fill="{PAPER}"/>']
side, top, hl = [], [], []
for r in range(N):
    for c in range(N):
        if not M[r][c] or in_finder(r, c) or in_logo(r, c): continue
        x, y = (c + Q) * S, (r + Q) * S
        g = float(os.environ.get("QR_G", "0.6")); w = S - 2 * g
        side.append(f'<rect x="{x+g+D*0.55:.1f}" y="{y+g+D:.1f}" width="{w:.1f}" height="{w:.1f}" rx="{RX}"/>')
        top.append(f'<rect x="{x+g:.1f}" y="{y+g:.1f}" width="{w:.1f}" height="{w:.1f}" rx="{RX}"/>')
        hl.append(f'<rect x="{x+g+3:.1f}" y="{y+g+2.5:.1f}" width="{w-6:.1f}" height="2.6" rx="1.3"/>')
if SHADOWS:
    parts.append(f'<g fill="{SHADOW}" transform="translate(2.5 4)">{"".join(side)}</g>')   # soft cast shadow
    parts.append(f'<g fill="{SIDE}">{"".join(side)}</g>')
parts.append(f'<g fill="url(#top)">{"".join(top)}</g>')
if os.environ.get("QR_HL", "1") == "1": parts.append(f'<g fill="#ffffff" fill-opacity=".22">{"".join(hl)}</g>')
# finder eyes: rounded frame + "level bubble" pupil, also extruded
for (fr, fc) in [(0, 0), (0, N - 7), (N - 7, 0)]:
    x, y = (fc + Q) * S, (fr + Q) * S
    o = 7 * S
    frame = f'M{x+S*FR},{y} h{o-2*S*FR} a{S*FR},{S*FR} 0 0 1 {S*FR},{S*FR} v{o-2*S*FR} a{S*FR},{S*FR} 0 0 1 -{S*FR},{S*FR} h-{o-2*S*FR} a{S*FR},{S*FR} 0 0 1 -{S*FR},-{S*FR} v-{o-2*S*FR} a{S*FR},{S*FR} 0 0 1 {S*FR},-{S*FR}z ' \
            f'M{x+S+S*PR},{y+S} h{5*S-2*S*PR} a{S*PR},{S*PR} 0 0 1 {S*PR},{S*PR} v{5*S-2*S*PR} a{S*PR},{S*PR} 0 0 1 -{S*PR},{S*PR} h-{5*S-2*S*PR} a{S*PR},{S*PR} 0 0 1 -{S*PR},-{S*PR} v-{5*S-2*S*PR} a{S*PR},{S*PR} 0 0 1 {S*PR},-{S*PR}z'
    parts.append(f'<path d="{frame}" fill="{SHADOW}" fill-rule="evenodd" transform="translate({D*0.55+2.5} {D+4})"/>')
    parts.append(f'<path d="{frame}" fill="{SIDE}" fill-rule="evenodd" transform="translate({D*0.55} {D})"/>')
    parts.append(f'<path d="{frame}" fill="url(#top)" fill-rule="evenodd"/>')
    px, py, pw = x + 2 * S, y + 2 * S, 3 * S
    parts.append(f'<rect x="{px+D*0.55}" y="{py+D}" width="{pw}" height="{pw}" rx="{S*PR}" fill="{SIDE}"/>')
    parts.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{pw}" rx="{S*PR}" fill="url(#top)"/>')
    # tiny yellow level-bubble highlight inside the pupil (still reads as dark)
    if os.environ.get("QR_PILL", "0") == "1":
        parts.append(f'<rect x="{px+S*0.75}" y="{py+S*1.15}" width="{S*1.5}" height="{S*0.7}" rx="{S*0.35}" fill="{YEL}" opacity=".9"/>')
# center logo: level vial badge with H
if not LOGO:
    parts.append('</svg>'); open(os.path.join(ROOT, "print", "qr.svg"), "w").write("\n".join(parts)); raise SystemExit
cx, cy, L = (c0 + Q) * S, (c0 + Q) * S, logo_mods * S
pad = S * 0.6
parts.append(f'<rect x="{cx+pad}" y="{cy+pad}" width="{L-2*pad}" height="{L-2*pad}" rx="{2*S*PR}" fill="{INK}"/>')
parts.append(f'<rect x="{cx+pad+6}" y="{cy+pad+6}" width="{L-2*pad-12}" height="{L-2*pad-12}" rx="{S*1.4}" fill="none" stroke="{YEL}" stroke-width="3"/>')
vx, vw, vh = cx + L*0.17, L*0.66, L*0.24
vy = cy + L*0.52
parts.append(f'<rect x="{vx}" y="{vy}" width="{vw}" height="{vh}" rx="{vh/2}" fill="{YEL}" stroke="{PAPER}" stroke-width="3.5"/>')
parts.append(f'<path d="M{vx+vw*0.36},{vy} v{vh} M{vx+vw*0.64},{vy} v{vh}" stroke="{INK}" stroke-width="3"/>')
parts.append(f'<ellipse cx="{vx+vw/2}" cy="{vy+vh/2}" rx="{vh*0.42}" ry="{vh*0.3}" fill="url(#bub)" stroke="{INK}" stroke-width="2.5"/>')
parts.append(f'<text x="{cx+L/2}" y="{cy+L*0.45}" text-anchor="middle" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="{L*0.3}" fill="{PAPER}" letter-spacing="1">H</text>')
parts.append('</svg>')
svg = "\n".join(parts)
open(os.path.join(ROOT, "print", "qr.svg"), "w").write(svg)
print("modules", N, "version", qr.version, "error", qr.error)
