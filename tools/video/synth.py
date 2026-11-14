"""Sound design for the how-to videos (all sounds synthesized, no third-party audio).
usage: python3 synth.py events.json out.wav"""
import json, sys, wave, numpy as np
SR = 44100
rng = np.random.default_rng(7)
d = json.load(open(sys.argv[1])); DUR = d['dur']
N = int(SR * (DUR + .5))
fx = np.zeros(N); mus = np.zeros(N)
t_ = lambda sec: np.arange(int(SR * sec)) / SR
def lp(x, a):  # one-pole low-pass, a in (0,1)
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x): acc += a * (v - acc); y[i] = acc
    return y
def hp(x, a): return x - lp(x, a)
def env(n, att, dec):
    t = np.arange(n) / SR; return np.minimum(1, t / max(att, 1e-4)) * np.exp(-t / dec)
def put(buf, at, x, v=1.0):
    i = int(at * SR); j = min(len(buf), i + len(x))
    if i < len(buf): buf[i:j] += x[:j - i] * v
def click():
    n = int(SR * .05); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 1850 * t) * np.exp(-t / .008) * .7 + np.sin(2 * np.pi * 900 * t) * np.exp(-t / .02) * .4
    noise = hp(rng.standard_normal(n), .5) * np.exp(-t / .002) * .5
    return body + noise
def key():
    n = int(SR * .045); t = np.arange(n) / SR; f = rng.uniform(1300, 2300)
    x = hp(rng.standard_normal(n), .35) * np.exp(-t / .006) * .6 + np.sin(2 * np.pi * f * t) * np.exp(-t / .01) * .35 + np.sin(2 * np.pi * 180 * t) * np.exp(-t / .012) * .25
    return x
def whoosh(sec=.45):
    n = int(SR * sec); t = np.arange(n) / SR
    e = np.sin(np.pi * np.clip(t / sec, 0, 1)) ** 2
    x = rng.standard_normal(n); out = np.empty(n); acc = 0.0
    for i in range(n):  # sweeping filter
        a = .02 + .25 * e[i]; acc += a * (x[i] - acc); out[i] = acc
    return out * e * 1.6
def swish(): return whoosh(.25) * .8
def thump():
    t = t_(.18); f = 120 * np.exp(-t / .05) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .07) * .9
def pop():
    t = t_(.14); f = 320 + 1100 * (t / .14)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), .003, .04) * .8
def bell(freq, dec=.6, sec=1.4):
    t = t_(sec); return sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t / (dec / m ** .5)) for m, a in [(1, 1), (2.01, .45), (3.02, .2), (4.2, .1)]) * env(len(t), .002, 10)
def blip():
    t = t_(.22); return (np.sin(2 * np.pi * 1046.5 * t) + .3 * np.sin(2 * np.pi * 2093 * t)) * env(len(t), .002, .06) * .45
def done():
    t = t_(.2); return np.sin(2 * np.pi * 1568 * t) * env(len(t), .002, .05) * .4
def chime(): x = np.zeros(int(SR * 1.6)); put(x, 0, bell(1318.5), .5); put(x, .11, bell(1975.5), .45); return x
def chime2():
    x = np.zeros(int(SR * 2.2))
    for i, f in enumerate([1046.5, 1318.5, 1568, 2093]): put(x, i * .09, bell(f, .8, 2.0), .4)
    return x
GEN = dict(click=(click, 1.1), key=(key, .7), whoosh=(whoosh, .5), swish=(swish, .45), thump=(thump, .6), pop=(pop, .7), blip=(blip, .5), done=(done, .5), chime=(chime, .7), chime2=(chime2, .7))
for k, at, v in d['events']:
    g, base = GEN[k]; put(fx, at, g(), base * v)
# --- music bed: soft lo-fi groove, 96 BPM, Am - F - C - G ---
bpm = 96; beat = 60 / bpm
def note(m): return 440 * 2 ** ((m - 69) / 12)
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
bars = int(DUR / (4 * beat)) + 2
pad_t = t_(4 * beat)
for b in range(bars):
    ch = chords[b % 4]; start = b * 4 * beat
    pad = sum(np.sin(2 * np.pi * note(m) * pad_t) + .5 * np.sin(2 * np.pi * note(m) * 1.003 * pad_t) for m in ch)
    e = np.minimum(1, pad_t / .3) * np.minimum(1, (4 * beat - pad_t) / .4)
    put(mus, start, lp(pad * e, .08), .05)
    bass_t = t_(beat * 1.8)
    for k in (0, 2.5):
        put(mus, start + k * beat, np.sin(2 * np.pi * note(ch[0] - 12) * bass_t) * env(len(bass_t), .01, .35), .22)
    for k in range(4):
        put(mus, start + k * beat, thump(), .35 if k % 2 == 0 else 0)
        sn = hp(rng.standard_normal(int(SR * .12)), .3) * env(int(SR * .12), .001, .03)
        if k % 2 == 1: put(mus, start + k * beat, sn, .12)
        for h in (0, .5):
            hh = hp(rng.standard_normal(int(SR * .04)), .7) * env(int(SR * .04), .001, .008)
            put(mus, start + (k + h) * beat, hh, .07 if h else .05)
# fade music in/out, duck a little under the outro chime
tt = np.arange(N) / SR
mus *= np.minimum(1, tt / 1.0) * np.clip((DUR - tt) / 1.2, 0, 1)
mix = fx + mus
mix = np.tanh(mix * 1.1) ; mix *= .89 / np.max(np.abs(mix))
pcm = (mix[:int(SR * DUR)] * 32767).astype(np.int16)
with wave.open(sys.argv[2], 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(sys.argv[2], round(DUR, 2), 's')
