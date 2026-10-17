# Soundtrack for the cartoon intro. Writes a 15 s stereo wav.
# 0.0 splat + sting · 1.2-4.6 takeover: heartbeat speeding up, whips, a blip per green light
# 4.6-7.0 the command: motor whine climbing, alarm · 7.0 silence, then the snap · 7.55 stamp
# 8.5-12 it waits: one slow heartbeat, a held note · 12.0 logo hit and chord
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
def chord(notes, d, a=.02, r=.4, saw=.4):
    x = x_(d); s = np.zeros(len(x))
    for m in notes:
        for det in (-.08, .08):
            f = hz(m + det); s += np.sin(2*np.pi*f*x) + saw*np.sin(4*np.pi*f*x) + saw*.5*np.sin(6*np.pi*f*x)
    return s / (len(notes)*3) * env(len(x), a, r)
def whip(d=.25):
    x = x_(d); s = noise(d, .35) * np.exp(-x*14)
    return s * np.sin(2*np.pi*(1800*np.exp(-x*9) + 200)*x)

# 0.0 cold open: splat and a brassy sting in D minor
x = x_(.6); add(noise(.6, .25) * np.exp(-x*7), 0, 1.0); add(thump(40, .8), 0, 1.2)
add(chord([50, 53, 57, 62], 1.1, .005, .7, .8), .03, .9)
# takeover: heartbeat getting faster
beats = []; t = 1.2; gap = .62
while t < 4.6: beats.append(t); t += gap; gap = max(.3, gap*.9)
for b in beats: add(thump(), b, .9); add(thump(40), b + .13, .5)
for c in (1.2, 2.2, 3.2): add(whip(.3), c, .7, -.4 if c == 2.2 else .4)  # whip on each cut
starts = [1.20, 1.55, 1.85, 2.20, 2.50, 2.80]
for i, s0 in enumerate(starts):
    add(whip(.2), s0 + .45, .35, .5 - i*.2)                               # each tendril lunges
    xb = x_(.18); add(np.sin(2*np.pi*hz(81 + (i % 3)*2)*xb) * np.exp(-xb*20), s0 + .85, .18, i*.3 - .7)  # light turns green
# a low drone and a pulse under the takeover
xd = x_(3.4); add((np.sin(2*np.pi*hz(38)*xd) + .5*np.sin(2*np.pi*hz(45)*xd)) * env(len(xd), .8, .2), 1.2, .35)
# the command: typing ticks, motor whine climbing, alarm
for i in range(18): add(noise(.02, .9) * np.exp(-x_(.02)*150), 4.85 + i*.036, .15, .3)
xm = x_(2.1); f = 120 + 900*(xm/2.1)**2
add(np.sign(np.sin(2*np.pi*np.cumsum(f)/SR)) * .25 * env(len(xm), .2, .01), 4.9, .45)
for i in range(int(2.1/.25)):
    xa = x_(.12); add(np.sign(np.sin(2*np.pi*hz(88)*xa)) * .3 * env(len(xa), .005, .02), 5.0 + i*.25, .25)
# 7.0 everything stops. one frame of silence, then the snap
out[int(7.0*SR):int(7.07*SR)] = 0
add(whip(.35), 7.067, 1.0); add(thump(55, .5), 7.08, 1.2)
add(noise(.3, .4) * np.exp(-x_(.3)*10), 7.2, .5)                          # the page slaps down
add(thump(44, .7), 7.55, 1.3); add(noise(.15, .6) * np.exp(-x_(.15)*30), 7.55, .6)  # stamp
# it waits: one slow heartbeat and a held, uneasy note
for b in (8.7, 9.9, 11.1): add(thump(42), b, .8); add(thump(36), b + .16, .45)
add(chord([50, 57, 64], 3.4, 1.0, .4, .2), 8.6, .55)
xh = x_(3.3); add(np.sin(2*np.pi*hz(74)*xh) * env(len(xh), .8, .2) * (1 + .3*np.sin(2*np.pi*5*xh)), 8.7, .08)
# 12.0 logo: hit, sting resolved to D major, tail
add(thump(40, 1.2), 12.0, 1.3); add(noise(.4, .3) * np.exp(-x_(.4)*8), 12.0, .5)
add(chord([50, 54, 57, 62, 66], 2.9, .005, 1.6, .7), 12.02, 1.0)
for m, d in ((78, .1), (81, .2), (86, .3)):
    xc = x_(2.0); add(np.sin(2*np.pi*hz(m)*xc) * np.exp(-xc*2), 12.0 + d, .09)

out[-int(.9*SR):] *= np.linspace(1, 0, int(.9*SR))[:, None]
out = np.tanh(out * 1.3); out /= np.abs(out).max() / .88
with wave.open(sys.argv[1], 'wb') as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes((out * 32767).astype('<i2').tobytes())
