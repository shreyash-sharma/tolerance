# Soundtrack for the dark-deco intro. Writes a 15 s stereo wav.
# 0.0 the factory: drone and a slow heartbeat · 1.6-4.6 takeover: heartbeat speeding up, a lunge and a blip per machine
# 4.6-8.0 the push in: fire crackling and roaring louder, rumble, alarm speeding up
# 8.0 the symbiote cools it: a hard hiss of steam, the roar dies, metal ticks · 10.0 the warning arrives
# 12.0 logo hit and chord
import numpy as np, wave, sys
SR = 48000; DUR = 15.0; N = int(SR * DUR)
out = np.zeros((N, 2)); rng = np.random.default_rng(3)

def hz(m): return 440 * 2 ** ((m - 69) / 12)
def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR); j = min(N, i + len(sig))
    if j <= i: return
    s = sig[: j - i] * gain
    out[i:j, 0] += s * (1 - pan) ** .5; out[i:j, 1] += s * (1 + pan) ** .5
def lowpass(s, a):
    y = np.empty_like(s); acc = 0.0
    for k in range(len(s)): acc += a * (s[k] - acc); y[k] = acc
    return y
def env(n, a, r):
    e = np.ones(n); na = max(1, int(a*SR)); nr = max(1, int(r*SR))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e
def x_(d): return np.arange(int(d*SR))/SR
def noise(d, a): return lowpass(rng.standard_normal(int(d*SR)), a)
def thump(f0=48, d=.32):
    x = x_(d); return np.sin(2*np.pi*(f0 + 60*np.exp(-x*25))*x) * np.exp(-x*12)
def chord(notes, d, a=.02, r=.4, saw=.35):
    x = x_(d); s = np.zeros(len(x))
    for m in notes:
        for det in (-.08, .08):
            f = hz(m + det); s += np.sin(2*np.pi*f*x) + saw*np.sin(4*np.pi*f*x) + saw*.5*np.sin(6*np.pi*f*x)
    return s / (len(notes)*3) * env(len(x), a, r)
def whip(d=.25):
    x = x_(d); return noise(d, .35) * np.exp(-x*14) * np.sin(2*np.pi*(1800*np.exp(-x*9) + 200)*x)

# the factory: a low drone under everything until the logo, two slow heartbeats
xd = x_(12.0); add((np.sin(2*np.pi*hz(33)*xd) + .4*np.sin(2*np.pi*hz(40)*xd)) * env(len(xd), .05, .6), 0, .4)
for b in (.05, .85): add(thump(), b, .8); add(thump(40), b + .14, .45)
# takeover: a hit as it gets in, heartbeat getting faster, a lunge and a blip as each machine turns green
add(thump(40, .8), 1.6, 1.1); add(chord([38, 50, 53, 57], 1.4, .005, .9), 1.62, .8)
beats = []; t = 1.6; gap = .62
while t < 4.6: beats.append(t); t += gap; gap = max(.32, gap*.92)
for b in beats: add(thump(), b, .85); add(thump(40), b + .13, .45)
for i, s0 in enumerate([1.60, 1.95, 2.25, 2.55, 2.85, 3.15]):
    add(whip(.22), s0 + .45, .4, .5 - i*.2)
    xb = x_(.18); add(np.sin(2*np.pi*hz(81 + (i % 3)*2)*xb) * np.exp(-xb*20), s0 + .85, .16, i*.3 - .7)
# the fire: crackles that thicken, a roar and a rumble that swell, an alarm that speeds up
d = 3.0; xo = x_(d); k = (xo/d)**1.4
add((noise(d, .5) - noise(d, .08)) * k * env(len(xo), .3, .02), 5.0, .6)                    # roar
add(noise(d, .01) * 6 * k * env(len(xo), .3, .02), 5.0, .8)                                  # rumble
c = 5.0
while c < 8.0:                                                                               # crackles
    p = (c - 5.0) / 3.0
    add(noise(.015, .9) * np.exp(-x_(.015)*200), c, .25 + .35*p, rng.uniform(-.8, .8)); c += .14 - .1*p*rng.uniform(.3, 1)
a = 5.4; g = .45
while a < 8.0:
    xa = x_(.1); add(np.sign(np.sin(2*np.pi*hz(88)*xa)) * .3 * env(len(xa), .005, .02), a, .2); a += g; g = max(.13, g*.85)
# 8.0 the symbiote cools it: the fire is cut, a hard hiss of steam, a low breath, the metal ticks as it cools
out[int(8.0*SR):int(12.0*SR)] *= .25
add(thump(36, 1.0), 8.0, 1.2)
xs = x_(1.8); add((noise(1.8, .95) - noise(1.8, .25)) * np.exp(-xs*1.6) * env(len(xs), .03, .3), 8.05, .8)
add(chord([50, 57, 62], 2.0, .2, 1.0, .1), 8.1, .5)
for i in range(8): add(noise(.02, .9) * np.exp(-x_(.02)*150), 9.0 + i*.16, .12, (i % 2) - .5)
# 10.0 the warning arrives: a two-note chime, then a held, calm chord
for m, dd in ((79, 0), (86, .12)):
    xc = x_(.8); add(np.sin(2*np.pi*hz(m)*xc) * np.exp(-xc*5), 10.0 + dd, .22)
add(chord([50, 57, 62, 66], 2.0, .3, .5, .15), 10.1, .4)
# 12.0 logo: hit, the chord resolves to D major, a chime tail
add(thump(40, 1.2), 12.0, 1.3); add(noise(.4, .3) * np.exp(-x_(.4)*8), 12.0, .5)
add(chord([38, 50, 54, 57, 62], 2.9, .005, 1.6), 12.02, 1.0)
for m, dd in ((78, .1), (81, .2), (86, .3)):
    xc = x_(2.0); add(np.sin(2*np.pi*hz(m)*xc) * np.exp(-xc*2), 12.0 + dd, .09)

out[-int(.9*SR):] *= np.linspace(1, 0, int(.9*SR))[:, None]
out = np.tanh(out * 1.3); out /= np.abs(out).max() / .88
with wave.open(sys.argv[1], 'wb') as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes((out * 32767).astype('<i2').tobytes())
