# Soft 120 BPM bed in A minor with cut whooshes, a stamp thud and a resolving chord. Writes music.wav.
import numpy as np, wave, sys
SR = 48000; DUR = 15.0; N = int(SR * DUR); t = np.arange(N) / SR
BEAT = 0.5
out = np.zeros((N, 2))
rng = np.random.default_rng(7)

def hz(m): return 440 * 2 ** ((m - 69) / 12)
def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR); j = min(N, i + len(sig))
    if j <= i: return
    s = sig[: j - i] * gain
    out[i:j, 0] += s * (1 - pan) ** .5; out[i:j, 1] += s * (1 + pan) ** .5
def env(n, a, r):
    e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e
def pad(notes, dur):
    n = int(dur * SR); x = np.arange(n) / SR; s = np.zeros(n)
    for m in notes:
        for det in (-0.08, 0.08):
            f = hz(m + det)
            s += np.sin(2*np.pi*f*x) + .3*np.sin(4*np.pi*f*x) + .12*np.sin(6*np.pi*f*x)
    return s / (len(notes) * 3) * env(n, .35, .6)
def lowpass(s, a=.06):
    y = np.zeros_like(s); acc = 0
    for k in range(len(s)): acc += a * (s[k] - acc); y[k] = acc
    return y

# chords: Am F C G, 2 s each, then outro on Am add9 -> F maj7 -> C
prog = [[57,60,64],[53,57,60],[48,55,64],[55,59,62]]
for bar in range(6):  # 0..12 s
    ch = prog[bar % 4]; add(pad(ch, 2.3), bar*2, .5)
    add(pad([ch[0]-12], 2.0), bar*2, .5)  # bass
add(pad([45,57,60,64,71], 3.3), 12, .55)

# drums from 1.0 s to 11 s, soft
def kick():
    n = int(.35*SR); x = np.arange(n)/SR
    return np.sin(2*np.pi*(45 + 70*np.exp(-x*30))*x) * np.exp(-x*9)
def hat():
    n = int(.06*SR); s = rng.standard_normal(n); return (s - lowpass(s, .3)) * np.exp(-np.arange(n)/SR*70)
k = kick()
for b in range(int(1/BEAT), int(11/BEAT)):
    if b % 2 == 0: add(k, b*BEAT, .55)
    add(hat(), b*BEAT + BEAT/2, .035, .3)

# whoosh into each cut, swelling filtered noise
def whoosh(d=.6):
    n = int(d*SR); s = lowpass(rng.standard_normal(n), .08)
    e = np.linspace(0, 1, n) ** 2; e[-int(.08*SR):] *= np.linspace(1, 0, int(.08*SR)); return s*e
for c in (3, 7, 11): add(whoosh(), c - .55, .45)
# soft typing ticks under the headline
for i in range(14): add(np.sin(2*np.pi*hz(81)*np.arange(400)/SR)*np.exp(-np.arange(400)/SR*300), .27 + i*.07, .04, .4*(i%2*2-1))
# score count tick-up, then stamp thud in A
for i in range(8): add(np.sin(2*np.pi*hz(69+i)*np.arange(1200)/SR)*np.exp(-np.arange(1200)/SR*60), 7.6 + i*.1, .06)
n = int(.6*SR); x = np.arange(n)/SR
add((np.sin(2*np.pi*55*x) + .4*np.sin(2*np.pi*110*x)) * np.exp(-x*7), 8.5, .8)
add(lowpass(rng.standard_normal(int(.15*SR)), .2) * np.exp(-np.arange(int(.15*SR))/SR*30), 8.5, .4)
# logo chime
for m, d in ((76, 0), (81, .12), (88, .24)):
    n = int(1.6*SR); x = np.arange(n)/SR
    add(np.sin(2*np.pi*hz(m)*x) * np.exp(-x*2.5), 11.1 + d, .08)

out[-int(1.2*SR):] *= np.linspace(1, 0, int(1.2*SR))[:, None]
out = np.tanh(out * 1.1); out /= np.abs(out).max() / .8
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())
