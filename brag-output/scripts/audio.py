# Soundtrack for the symbiote intro: heartbeat in the dark, wet tendrils, hits on each line,
# a pull-in whoosh and a landing chord on the logo. Writes a 15 s stereo wav.
import numpy as np, wave, sys
SR = 48000; DUR = 15.0; N = int(SR * DUR)
out = np.zeros((N, 2)); rng = np.random.default_rng(7)

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
def tone(notes, dur, a=.3, r=.6, bright=.3):
    n = int(dur*SR); x = np.arange(n)/SR; s = np.zeros(n)
    for m in notes:
        for det in (-.07, .07):
            f = hz(m + det); s += np.sin(2*np.pi*f*x) + bright*np.sin(4*np.pi*f*x)
    return s / (len(notes)*2.6) * env(n, a, r)
def thump(f0=48, d=.32):
    n = int(d*SR); x = np.arange(n)/SR
    return np.sin(2*np.pi*(f0 + 50*np.exp(-x*25))*x) * np.exp(-x*12)
def noise(d, a): return lowpass(rng.standard_normal(int(d*SR)), a)

# heartbeat in the dark, then it keeps beating under the tendrils, faster
beats = [.1, 1.0]; t = 1.85; gap = .8
while t < 5.0: beats.append(t); t += gap; gap = max(.42, gap*.9)
for b in beats: add(thump(), b, .9); add(thump(40), b + .16, .55)
# low drone that rises with the tendrils
n = int(4.0*SR); x = np.arange(n)/SR
drone = (np.sin(2*np.pi*hz(33)*x) + .5*np.sin(2*np.pi*hz(45)*x*(1 + x*.004))) * env(n, 1.5, .1)
add(drone, 1.4, .35)
# wet tendril texture: band-limited noise, wobbling in level, panned left and right
for k, (s0, pan) in enumerate([(1.6, -.6), (1.8, .5), (2.1, -.2), (2.4, .7)]):
    d = 3.2 - (s0 - 1.6); sq = noise(d, .05) - noise(d, .01)
    lfo = .5 + .5*np.sin(2*np.pi*(5 + k)*np.arange(len(sq))/SR)
    add(sq * lfo * env(len(sq), .3, .3), s0, .5, pan)
# a soft drip as each machine is bonded
for i, b in enumerate([3.0, 3.2, 3.4, 3.5, 3.7, 3.9, 3.6, 3.1]):
    n = int(.25*SR); x = np.arange(n)/SR
    add(np.sin(2*np.pi*(hz(76 + (i % 4)*3) * (1 + 1.5*np.exp(-x*30)))*x) * np.exp(-x*18), b, .07, (i % 2)*1.2 - .6)
# rise into the flood, then the flood hit
n = int(1.3*SR); w = noise(1.3, .12) * np.linspace(0, 1, n)**3; add(w, 3.75, .9)
add(thump(36, .9), 5.0, 1.2); add(noise(.4, .3) * np.exp(-np.arange(int(.4*SR))/SR*9), 5.0, .5)
# music bed under the three lines: A minor pulse
for bar, ch in enumerate([[57, 60, 64], [53, 57, 60], [55, 59, 62]]):
    add(tone(ch, 1.1, .02, .3, .5), 5.9 + bar*1.05, .45); add(tone([ch[0] - 24], 1.1, .01, .3), 5.9 + bar*1.05, .6)
for s in (5.9, 6.95, 8.0):                      # each line slams in
    add(thump(55, .5), s, .9); add(noise(.12, .5) * np.exp(-np.arange(int(.12*SR))/SR*40), s, .35)
for b in np.arange(5.9, 8.9, .2625):           # sixteenth ticks
    add(noise(.03, .9) * np.exp(-np.arange(int(.03*SR))/SR*120), b + .13, .06, .3)
# reverse whoosh: the liquid pulls back in
n = int(.95*SR); w = noise(.95, .2) * np.linspace(0, 1, n)**2.5; add(w, 8.85, .9)
# logo lands: hit, chime, warm chord
add(thump(41, 1.2), 9.8, 1.3)
for m, d in ((76, 0), (81, .1), (88, .2)):
    n = int(2.5*SR); x = np.arange(n)/SR; add(np.sin(2*np.pi*hz(m)*x) * np.exp(-x*1.8), 9.8 + d, .1)
add(tone([45, 57, 60, 64, 71], 5.2, .05, 2.5), 9.8, .7)

out[-int(1.0*SR):] *= np.linspace(1, 0, int(1.0*SR))[:, None]
out = np.tanh(out * 1.2); out /= np.abs(out).max() / .85
with wave.open(sys.argv[1], 'wb') as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes((out * 32767).astype('<i2').tobytes())
