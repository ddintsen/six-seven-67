#!/usr/bin/env python3
"""Original score for the 67 reel, synthesized from the reel's cue list.

Version 2 (12 October, the owner asked for "slightly different music"): 120
BPM in F minor, a night-garage groove. A plucked glass-and-wood bar plays
every cube the picture shows (Yes cubes left, No cubes right); a broken
two-step kick, snare on two and four, swung sixteenths and a driven sub bass
carry the middle; a sung chord hook rides on top; quiet taps mark the
interface shots. Nothing is sampled or licensed: every sound is generated
here, so the track is the project's own. The first version's voices (the FM
glass bell, the four-on-the-floor kit) stay below for reuse; its score is in
the git history (commit 04f3587).

    python3 reel/music.py reel/cues.json out.wav
"""
import json
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BEAT = 0.5
rng = np.random.default_rng(67)


def midi(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def sos(kind, freq, order=2):
    return signal.butter(order, freq, kind, fs=SR, output='sos')


def pan2(x, pan):
    left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * left, x * right])


def fade_tail(x, seconds=0.03):
    n = min(len(x) if x.ndim == 1 else x.shape[-1], int(seconds * SR))
    ramp = np.linspace(1, 0, n)
    if x.ndim == 1:
        x[-n:] *= ramp
    else:
        x[:, -n:] *= ramp
    return x


class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n))
        return self.buses[name]

    def add(self, name, at, x, pan=0.0, gain=1.0):
        out = self.bus(name)
        if x.ndim == 1:
            x = pan2(x, pan)
        start = int(round(at * SR))
        if start < 0:
            x, start = x[:, -start:], 0
        end = min(self.n, start + x.shape[1])
        if end > start:
            out[:, start:end] += gain * x[:, :end - start]


# ------------------------------------------------------------------ voices
def saw(freq, n, phase0=0.0):
    dt = freq / SR
    phase = (phase0 + dt * np.arange(n)) % 1.0
    x = 2 * phase - 1
    low = phase < dt
    t = phase[low] / dt
    x[low] -= t + t - t * t - 1
    high = phase > 1 - dt
    t = (phase[high] - 1) / dt
    x[high] -= t * t + t + t + 1
    return x


def bell(note, bright=1.0, length=2.6):
    """Glass: FM with an inharmonic 3.5 ratio, a bright attack that mellows,
    and a short high partial for the tap of glass on glass."""
    freq = midi(note)
    n = int(length * SR)
    t = np.arange(n) / SR
    decay = 1.25 * (440 / freq) ** 0.3
    # High notes get a gentler modulation: sweeter, and no sidebands near Nyquist.
    bright *= min(1.0, (1000 / freq) ** 0.6)
    index = 2.4 * bright * np.exp(-t / 0.16) + 0.3
    tone = np.sin(2 * np.pi * freq * t + index * np.sin(2 * np.pi * freq * 3.5 * t))
    tap = np.sin(2 * np.pi * freq * 4.17 * t) * np.exp(-t / 0.045) * 0.32 * bright
    body = np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / (decay * 0.45)) * 0.14
    attack = np.minimum(1, t / 0.0015)
    return fade_tail((tone + tap + body) * np.exp(-t / decay) * attack)


def kick(length=0.5):
    n = int(length * SR)
    t = np.arange(n) / SR
    freq = 46 + 84 * np.exp(-t / 0.034)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.17)
    click = signal.sosfilt(sos('highpass', 1800), rng.standard_normal(n)) * np.exp(-t / 0.0035) * 0.5
    # A 0.6 ms attack keeps the transient punchy without a one-sample click.
    return fade_tail(np.tanh((body + click) * 1.7) * np.minimum(1, t / 0.0006))


def clap():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for offset in (0, 0.009, 0.019):
        s = int(offset * SR)
        env[s:] += np.exp(-t[:n - s] / 0.006)
    env += np.where(t > 0.019, np.exp(-(t - 0.019) / 0.12), 0) * 0.55
    return fade_tail(signal.sosfilt(sos('bandpass', [850, 3300]), rng.standard_normal(n) * env * np.minimum(1, t / 0.0005)))


HAT = sos('highpass', 7200, 4)


def hat(open_hat=False):
    n = int((0.4 if open_hat else 0.09) * SR)
    t = np.arange(n) / SR
    metal = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = signal.sosfilt(HAT, metal * 0.35 + rng.standard_normal(n))
    return fade_tail(x * np.exp(-t / (0.12 if open_hat else 0.022)) * np.minimum(1, t / 0.0003))


def crash(length=2.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(sos('highpass', 3500), rng.standard_normal(n))
    return fade_tail(x * np.exp(-t / 0.7) * np.minimum(1, t / 0.004))


def boom(length=1.8):
    n = int(length * SR)
    t = np.arange(n) / SR
    freq = 33 + 46 * np.exp(-t / 0.11)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.6)
    rumble = signal.sosfilt(sos('lowpass', 380), rng.standard_normal(n)) * np.exp(-t / 0.3) * 0.6
    return fade_tail(np.tanh((body + rumble) * 1.5))


def riser(length):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    block = 480
    state = None
    for s in range(0, n, block):
        u = s / n
        centre = 250 * (9000 / 250) ** u
        coefficients = sos('bandpass', [centre * 0.7, min(centre * 1.45, SR * 0.45)])
        if state is None:
            state = np.zeros((coefficients.shape[0], 2))
        out[s:s + block], state = signal.sosfilt(coefficients, noise[s:s + block], zi=state)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * np.cumsum(180 * 4 ** (t / length)) / SR) * 0.25
    return fade_tail((out + tone) * (t / length) ** 2.2, 0.01)


def lift(length=0.36):
    """A cube leaving a pan: a short upward glide."""
    n = int(length * SR)
    t = np.arange(n) / SR
    freq = 520 * 3.2 ** (t / length)
    return fade_tail(np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.sin(np.pi * t / length) ** 2)


def tick():
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    return fade_tail(np.sin(2 * np.pi * 2350 * t) * np.exp(-t / 0.011) + rng.standard_normal(n) * np.exp(-t / 0.003) * 0.35)


def bass(note, length, cutoff):
    n = int(length * SR)
    t = np.arange(n) / SR
    freq = midi(note)
    # More saw than sine, so the line still reads on phone speakers.
    x = saw(freq, n) * 0.7 + np.sin(2 * np.pi * freq * t) * 0.6
    x = signal.sosfilt(sos('lowpass', cutoff), x)
    env = np.minimum(1, t / 0.004) * np.exp(-t / (length * 1.4))
    return fade_tail(x * env, 0.02)


def pad(notes, length, cutoff=1500, attack=0.8, release=1.4):
    n = int((length + release) * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    for note in notes:
        for detune, pos in ((-0.08, -0.65), (0.0, 0.0), (0.08, 0.65)):
            out += pan2(saw(midi(note) * 2 ** (detune / 12), n, rng.random()), pos)
    out = signal.sosfilt(sos('lowpass', cutoff, 4), out, axis=1)
    env = np.minimum(1, t / attack) * np.where(t < length, 1.0, np.exp(-(t - length) / (release / 4)))
    return fade_tail(out * env / (len(notes) * 2.2))


def air(length):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(sos('lowpass', 520), rng.standard_normal((2, n)), axis=1)
    return x * (0.6 + 0.4 * np.sin(2 * np.pi * 0.11 * t))


# ------------------------------------------------------------------ effects
def impulse(seconds, damp, seed):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.random.default_rng(seed).standard_normal((2, n)) * np.exp(-t * 6.9 / seconds)
    ir = signal.sosfilt(sos('lowpass', damp, 1), ir, axis=1)
    ir = np.concatenate([np.zeros((2, int(0.018 * SR))), ir], axis=1)
    return ir / np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))


def convolve(x, ir):
    return np.stack([signal.fftconvolve(x[c], ir[c])[:x.shape[1]] for c in range(2)])


def pingpong(x, delay=0.375, feedback=0.38, taps=6):
    d = int(delay * SR)
    out = np.zeros_like(x)
    gain = 1.0
    for k in range(1, taps + 1):
        shift = d * k
        if shift >= x.shape[1]:
            break
        source = x[0] + x[1]
        out[k % 2, shift:] += source[:-shift] * gain * 0.5
        gain *= feedback
    return signal.sosfilt(sos('lowpass', 3800), out, axis=1)


def lowpass_sweep(x, start, end, f0, f1):
    """Close a filter over [start, end] seconds, from f0 to f1 Hz."""
    a, b = int(start * SR), int(end * SR)
    block = 480
    state = None
    for s in range(a, b, block):
        u = (s - a) / (b - a)
        coefficients = sos('lowpass', f0 * (f1 / f0) ** u)
        if state is None:
            state = np.zeros((coefficients.shape[0], 2, 2))
        for c in range(2):
            x[c, s:s + block], state[:, :, c] = signal.sosfilt(coefficients, x[c, s:s + block], zi=state[:, :, c])
    return x


# ------------------------------------------------------------------ voices (v2)
def pluck(note, bright=1.0, length=1.8):
    """A struck glass-and-wood bar: a few slightly stretched partials, the
    high ones dying first, and a short tap on the attack. Tuned exactly."""
    f = midi(note)
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    base = 0.95 * (440 / f) ** 0.35
    for k in range(1, 9):
        fk = f * k * (1 + 0.0005 * k * k)
        if fk > SR * 0.42:
            break
        amp = 1 / k ** (1.75 - 0.55 * bright)
        out += amp * np.sin(2 * np.pi * fk * t) * np.exp(-t / (base / (1 + 0.7 * (k - 1))))
    tap = signal.sosfilt(sos('bandpass', [min(f * 2, 7000), min(f * 7, 15000)]), rng.standard_normal(n)) * np.exp(-t / 0.0035) * 0.22 * bright
    return fade_tail((out * 0.5 + tap) * np.minimum(1, t / 0.0007))


AH = ((780, 110, 1.0), (1180, 120, 0.55), (2650, 170, 0.22))
OH = ((520, 90, 1.0), (880, 110, 0.45), (2500, 170, 0.15))


def vox(notes, length, vowel=AH, release=0.22, bright=1.0):
    """A sung chord stab: detuned saws through three vowel formants."""
    n = int((length + release) * SR)
    t = np.arange(n) / SR
    src = np.zeros(n)
    for note in notes:
        for detune in (-0.08, 0.08):
            src += saw(midi(note) * 2 ** (detune / 12), n, rng.random())
    src = signal.sosfilt(sos('lowpass', 5200 * bright), src)
    out = np.zeros(n)
    for centre, width, gain in vowel:
        out += gain * signal.sosfilt(sos('bandpass', [centre - width, centre + width]), src)
    body = np.exp(-t / max(0.12, length * 2.2))
    tail = np.where(t < length, 1.0, np.exp(-(t - length) / (release / 3)))
    return fade_tail(out * body * tail * np.minimum(1, t / 0.006) / len(notes))


def sub(note, length, drive=1.6):
    """Sine bass with a little drive, so phone speakers still hear its harmonics."""
    f = midi(note)
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.tanh(np.sin(2 * np.pi * f * t) * drive) / np.tanh(drive)
    env = np.minimum(1, t / 0.004) * np.clip((length - t) / 0.025, 0, 1)
    return x * env


def snare():
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(185 + 70 * np.exp(-t / 0.012)) / SR) * np.exp(-t / 0.055)
    noise = signal.sosfilt(sos('bandpass', [1300, 7500]), rng.standard_normal(n)) * np.exp(-t / 0.085)
    return fade_tail(np.tanh((body * 0.75 + noise * 0.85) * 1.35) * np.minimum(1, t / 0.0005))


def rim():
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 1720 * t) * np.exp(-t / 0.011) + signal.sosfilt(sos('bandpass', [2600, 6400]), rng.standard_normal(n)) * np.exp(-t / 0.004) * 0.6
    return fade_tail(x * np.minimum(1, t / 0.0004))


def shaker():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    env = (t / 0.028) ** 1.6 * np.exp(-t / 0.028)
    x = signal.sosfilt(sos('bandpass', [5200, 11500]), rng.standard_normal(n))
    return fade_tail(x * env / np.max(env))


def deep_kick(length=0.55):
    n = int(length * SR)
    t = np.arange(n) / SR
    freq = 43 + 95 * np.exp(-t / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.22)
    click = signal.sosfilt(sos('highpass', 2200), rng.standard_normal(n)) * np.exp(-t / 0.003) * 0.4
    return fade_tail(np.tanh((body + click) * 1.9) * np.minimum(1, t / 0.0006))


def press_click():
    """A tactile button: a short high tick on a soft low knock."""
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    knock = np.sin(2 * np.pi * 210 * t) * np.exp(-t / 0.016)
    high = np.zeros(n)
    tap = tick()[:n]
    high[:len(tap)] = tap
    return fade_tail(high * 0.7 + knock * 0.6)


def whoosh(length=0.55):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    noise = rng.standard_normal(n)
    block, state = 480, None
    for s0 in range(0, n, block):
        u = s0 / n
        centre = 500 * (7000 / 500) ** u
        coefficients = sos('bandpass', [centre * 0.6, min(centre * 1.6, SR * 0.45)])
        if state is None:
            state = np.zeros((coefficients.shape[0], 2))
        out[s0:s0 + block], state = signal.sosfilt(coefficients, noise[s0:s0 + block], zi=state)
    return fade_tail(out * np.sin(np.pi * t / length) ** 2, 0.01)


# ------------------------------------------------------------------ score (v2)
# 120 BPM in F minor, a night-garage groove: a broken two-step kick, snare on
# two and four, swung sixteenths, a sung chord hook, a driven sub bass and
# plucked glass-and-wood bars for every cube. Bars are two seconds; the film's
# scenes start on bar lines.
STEP = 0.125
SWING = 0.018


def swung(step):
    return step * STEP + (SWING if step % 2 else 0.0)


CHORD_RUN = (
    ['Fm', 'Fm', 'Db', 'Eb']                       # 0-8    the mark
    + ['Fm', 'Db', 'Ab', 'Eb']                     # 8-16   forest, list
    + ['Fm', 'Db', 'Ab', 'Eb'] * 2                 # 16-32  ticket, price
    + ['Fm', 'Db', 'Ab', 'Eb'] * 2                 # 32-48  the four calls
    + ['Fm', 'Db']                                 # 48-52  the claim
    + ['Bbm', 'Eb']                                # 52-56  the code
    + ['Db', 'Ab']                                 # 56-60  built on Gno.land
    + ['Fm', 'Db', 'Ab', 'Eb']                     # 60-68  the end
)
CHORDS2 = [(2 * k, chord) for k, chord in enumerate(CHORD_RUN)]
VOICE = {
    'Fm': [53, 56, 60, 63, 67], 'Db': [49, 53, 56, 60, 63], 'Ab': [56, 60, 63, 67, 70],
    'Eb': [51, 55, 58, 62, 65], 'Bbm': [46, 53, 58, 61, 65],
}
TONES = {'Fm': [5, 8, 0, 3], 'Db': [1, 5, 8, 0], 'Ab': [8, 0, 3, 7], 'Eb': [3, 7, 10, 5], 'Bbm': [10, 1, 5, 8]}
BASS_ROOT = {'Fm': 29, 'Db': 25, 'Ab': 32, 'Eb': 27, 'Bbm': 34}


def chord_at(at):
    current = CHORDS2[0][1]
    for start, chord in CHORDS2:
        if at + 1e-9 >= start:
            current = chord
    return current


def stab(chord, top, count=3):
    """The chord's tones under a melody note."""
    notes = [top]
    pitch = top - 1
    while len(notes) < count and pitch > top - 24:
        if pitch % 12 in TONES[chord] and top - pitch >= 3:
            notes.append(pitch)
        pitch -= 1
    return notes


# The hook: a two-bar figure of sung stabs, on sixteenths, top notes in F minor.
HOOK = [(0, 72), (3, 72), (6, 75), (10, 72), (16 + 2, 77), (16 + 6, 75), (16 + 9, 72), (16 + 12, 68)]

MARK_SIX2 = [65, 68, 70, 72, 75, 77, 80, 82, 84, 87, 89]
MARK_SEVEN2 = [87, 84, 82, 80, 77, 75, 72]
MARK_LEAVE2 = [89, 87, 84, 82, 80, 77, 75, 72, 70, 68, 65, 63, 60, 58, 56, 53, 51, 48]
PILE2 = [77, 80, 84, 82, 80, 77, 75, 77, 80, 82, 84]
STORY2 = [72, 75, 77, 80, 82, 84, 82, 80, 77, 80, 84, 87, 89, 87, 84, 80]
CLAIM2 = [77, 80, 82, 84, 87, 89, 92, 94, 96]
CHECK2 = [(72, 77), (75, 80), (77, 84)]
QUOTE2 = [84, 87, 89]


def score(cues, duration):
    mix = Mix(duration + 0.5)
    by_kind = {}
    for cue in cues:
        by_kind.setdefault(cue['kind'], []).append(cue)
    end_of = duration

    # Pad: warm, filtered, all the way through; louder where nothing drums.
    def pad_gain(at):
        if at < 8:
            return 0.55
        if at < 16:
            return 0.5
        if at < 52:
            return 0.36
        if at < 60:
            return 0.62
        return 0.7
    for at, chord in CHORDS2:
        mix.add('pad', at, pad(VOICE[chord], 2.0, cutoff=800 if at < 16 or at >= 52 else 1250, attack=0.5), gain=pad_gain(at))
    opening = mix.bus('pad')
    opening[:, :int(2.5 * SR)] *= np.linspace(0, 1, int(2.5 * SR)) ** 1.4
    mix.add('air', 0, air(9), gain=0.04)
    mix.add('air', 56, air(12), gain=0.04)

    # Drums. Forest: kick and rim, sparse hats. From the list: the full
    # two-step. Through the code the filters close; then no drums.
    groove_bars = [b for b in range(4, 26)]          # bars 4-25 = 8 s to 52 s
    kicks = []
    for bar in groove_bars:
        at = bar * 2.0
        full = at >= 12
        drop = at >= 16
        for step in ((0, 10) if full else (0, 10)):
            mix.add('drums', at + step * STEP, deep_kick(), gain=0.62)
            kicks.append(at + step * STEP)
        if drop and bar % 2 == 1:
            # A ghost kick before the next bar keeps the two-step rolling.
            mix.add('drums', at + 15 * STEP, deep_kick(0.3), gain=0.22)
        if full:
            for step in (4, 12):
                mix.add('drums', at + step * STEP, snare(), pan=0.04, gain=0.62)
                mix.add('drums', at + step * STEP + 0.008, clap(), pan=-0.04, gain=0.22)
        else:
            for step in (4, 12):
                mix.add('drums', at + step * STEP, rim(), pan=0.1, gain=0.3)
        for step in range(16):
            when = at + swung(step)
            if not full and step % 4 != 2:
                continue
            accent = (0.32, 0.12, 0.55, 0.14)[step % 4] if full else 0.4
            mix.add('drums', when, hat(), pan=0.2, gain=0.4 * accent / 0.55)
            if drop and step % 2 == 1:
                mix.add('drums', when, shaker(), pan=-0.25, gain=0.11)
        if drop:
            for step in (6, 14):
                mix.add('drums', at + swung(step), hat(True), pan=-0.18, gain=0.15)
            if bar % 2 == 0:
                mix.add('drums', at + 7 * STEP, rim(), pan=0.3, gain=0.12)
    # The build into the drop: a snare roll swelling over the last bar of the list.
    for k in range(16):
        mix.add('drums', 14 + k * STEP, snare(), gain=0.05 + 0.32 * (k / 15) ** 2)
    for at in (16, 32, 48):
        mix.add('drums', at, crash(), gain=0.14)

    # Bass: long sub notes in the forest; a bouncing line from the drop.
    for at, chord in CHORDS2:
        root = BASS_ROOT[chord]
        if 8 <= at < 16:
            mix.add('bass', at, sub(root, 1.9, 1.2), gain=0.3)
            mix.add('bass', at, bass(root + 12, 1.9, 340), gain=0.45)
        elif 16 <= at < 52:
            for step, interval, length in ((0, 0, 0.32), (3, 12, 0.12), (6, 0, 0.2), (10, 7, 0.2), (13, 12, 0.12)):
                note = root + interval
                mix.add('bass', at + swung(step), sub(note, length, 1.2), gain=0.32)
                mix.add('bass', at + swung(step), bass(note + 12, length, 700), gain=0.55)
        elif 56 <= at < 60:
            mix.add('bass', at, sub(root, 1.95, 1.2), gain=0.34)

    # Sidechain: pad, voices and the arpeggio breathe with the kick.
    t = np.arange(mix.n) / SR
    duck = np.ones(mix.n)
    for at in kicks:
        s0 = int(at * SR)
        e0 = min(mix.n, s0 + int(0.32 * SR))
        duck[s0:e0] = np.minimum(duck[s0:e0], 1 - 0.5 * np.exp(-(t[s0:e0] - at) / 0.085))

    # The hook: sung stabs from the drop until the code, resting where the
    # cubes carry the melody.
    def rests(at):
        return 36 <= at < 38.6 or 44 <= at < 47.2 or 20.9 <= at < 22.1
    for bar_pair in range(8, 26, 2):
        start = bar_pair * 2.0
        if start < 16 or start >= 52:
            continue
        for step, top in HOOK:
            when = start + swung(step % 16) + (2.0 if step >= 16 else 0.0)
            if rests(when):
                continue
            chord = chord_at(when)
            mix.add('vox', when, vox(stab(chord, top), 0.16, AH), pan=(-0.2 if step % 2 else 0.2), gain=0.95)
    # Words of the opening, and the scene turns: longer sung chords.
    for at, chord, top in ((4, 'Fm', 72), (6, 'Db', 72), (7, 'Eb', 70), (8, 'Fm', 75), (56, 'Db', 77), (62, 'Db', 72), (66, 'Ab', 75)):
        mix.add('vox', at, vox(stab(chord, top, 4), 0.9 if at < 8 else 1.6, OH, release=0.6, bright=0.8), gain=0.8)

    for name in ('pad', 'vox'):
        mix.bus(name)[:] *= duck

    # Hits and risers on the scene turns.
    for at, gain in ((8, 0.6), (16, 0.85), (20, 0.4), (32, 0.6), (48, 0.5), (52, 0.4), (56, 0.5), (60, 0.5)):
        mix.add('hits', at, boom(), gain=gain)
    for start, length, gain in ((6.5, 1.5, 0.26), (13, 3, 0.3), (30.75, 1.25, 0.2), (46.75, 1.25, 0.18), (54.4, 1.6, 0.2)):
        mix.add('hits', start, riser(length), gain=gain)
    mix.bus('hits')[:] = np.stack([signal.sosfilt(sos('highpass', 24), mix.bus('hits')[c]) for c in range(2)])

    # Plucked bars: every cube the picture shows.
    def bar_note(at, note, pan, gain, bright=1.0, length=1.8):
        mix.add('pluck', at, pluck(note, bright, length), pan=pan, gain=gain)

    six = [c for c in by_kind['mark-land'] if c['side'] == 'yes']
    seven = [c for c in by_kind['mark-land'] if c['side'] == 'no']
    for cue, note in zip(six, MARK_SIX2):
        bar_note(cue['at'], note, -0.4, 0.5 if cue is six[0] else 0.36, 1.2 if cue is six[0] else 1.0)
    for cue, note in zip(seven, MARK_SEVEN2):
        bar_note(cue['at'], note, 0.4, 0.34)
    for cue, note in zip(by_kind['pile-land'], PILE2):
        bar_note(cue['at'], note, -0.4 if cue['side'] == 'yes' else 0.4, 0.34)
    for cue in by_kind['pile-rise']:
        mix.add('pluck', cue['at'], lift(), pan=0.4, gain=0.1)
    for cue, note in zip(by_kind['quote'], QUOTE2):
        mix.add('ui', cue['at'], tick(), pan=-0.1, gain=0.18)
        bar_note(cue['at'] + STEP, note, -0.2, 0.26, 0.8)
    for cue in by_kind.get('tap', []):
        mix.add('ui', cue['at'], press_click(), pan=-0.2, gain=0.3)
        bar_note(cue['at'], 84, -0.3, 0.3, 0.9)
    for cue in by_kind['seal']:
        mix.add('ui', cue['at'], tick(), gain=0.26)
        bar_note(cue['at'], 53, 0.1, 0.42, 0.6, 2.4)
    for cue, note in zip(by_kind['story-land'], STORY2):
        bar_note(cue['at'], note, -0.4 if cue['side'] == 'yes' else 0.4, 0.32)
    for cue in by_kind['oracle']:
        for k, note in enumerate((77, 80, 84, 89, 92)):
            bar_note(cue['at'] + k * 0.035, note, -0.3 + k * 0.15, 0.24, 0.9, 2.4)
        mix.add('vox', cue['at'], vox(stab('Ab', 84, 4), 1.2, OH, release=0.5), gain=0.6)
    for k, (cue, note) in enumerate(zip(by_kind['claim'], CLAIM2)):
        bar_note(cue['at'], note, -0.4 + k * 0.08, 0.32)
    for cue, (low, high) in zip(by_kind['check'], CHECK2):
        bar_note(cue['at'], low, -0.15, 0.3, 0.8)
        bar_note(cue['at'], high, 0.15, 0.24, 0.8)
    for cue in by_kind['continued']:
        bar_note(cue['at'], 53, -0.2, 0.36, 0.5, 2.6)
        bar_note(cue['at'], 60, 0.2, 0.28, 0.5, 2.6)
    leave = sorted(by_kind['mark-leave'], key=lambda c: c['at'])
    for k, (cue, note) in enumerate(zip(leave, MARK_LEAVE2)):
        bar_note(cue['at'], note, -0.4 if cue['side'] == 'yes' else 0.4, 0.3 * (1 - k / 28), 0.8)
    bar_note(end_of - 1.6, 41, 0, 0.4, 0.4, 2.0)
    bar_note(end_of - 1.6, 53, 0, 0.3, 0.4, 2.0)

    # The interface: quiet, tactile, on the beat.
    for cue in by_kind.get('ui-in', []):
        mix.add('ui', cue['at'] - 0.18, whoosh(0.5), gain=0.12)
    for cue in by_kind.get('press', []):
        mix.add('ui', cue['at'], press_click(), pan=0.15, gain=0.34)
    for cue in by_kind.get('ui-cut', []):
        mix.add('ui', cue['at'], tick(), pan=0.1, gain=0.12)
    for cue in by_kind.get('confirmed', []):
        bar_note(cue['at'], 84, 0.15, 0.3, 1.0)
        bar_note(cue['at'] + STEP, 89, 0.25, 0.26, 1.0)
    for cue in by_kind.get('claimed', []):
        for k, note in enumerate((77, 80, 84, 89)):
            bar_note(cue['at'] + k * 0.0625, note, -0.1 + k * 0.1, 0.28, 1.0)

    # A soft pluck arpeggio keeps the groove moving between the cues.
    arp_steps = (0, 3, 6, 8, 11, 14)
    for at, chord in CHORDS2:
        if not 12 <= at < 52:
            continue
        notes = [p for p in VOICE[chord][1:]]
        for k, step in enumerate(arp_steps):
            when = at + swung(step)
            if rests(when) or 16 <= when < 20 and k % 2:
                continue
            mix.add('arp', when, pluck(notes[(k * 2) % len(notes)] + 12, 0.6, 0.9), pan=-0.3 if k % 2 else 0.3, gain=0.11 if at < 16 else 0.14)
    # Built on Gno.land: a slow arpeggio on quarter notes, no drums.
    for at, chord in CHORDS2:
        if 56 <= at < 60:
            for k in range(4):
                mix.add('arp', at + k * 0.5, pluck(VOICE[chord][1 + k % 4] + 12, 0.5, 2.2), pan=-0.3 + k * 0.2, gain=0.2)
    mix.bus('arp')[:] *= duck

    # The code scene closes the filters on drums and bass; then they stop.
    for name in ('drums', 'bass'):
        lowpass_sweep(mix.bus(name), 52, 56, 16000, 380)
        mix.bus(name)[:, int(56 * SR):] = 0

    # Space.
    long_room = impulse(2.8, 5600, 3)
    short_room = impulse(0.8, 7000, 4)
    plucks = mix.bus('pluck') + mix.bus('arp') * 0.9
    wet_plucks = convolve(plucks + pingpong(plucks, delay=0.375, feedback=0.34) * 0.5, long_room)
    wet_vox = convolve(mix.bus('vox'), long_room)
    wet_pad = convolve(mix.bus('pad'), long_room)
    wet_drums = convolve(mix.bus('drums'), short_room)
    wet_hits = convolve(mix.bus('hits'), long_room)
    wet_ui = convolve(mix.bus('ui'), short_room)

    master = (
        mix.bus('drums') * 1.0 + wet_drums * 0.1
        + mix.bus('bass') * 1.0
        + mix.bus('pad') * 1.0 + wet_pad * 0.35
        + mix.bus('vox') * 0.9 + wet_vox * 0.3
        + plucks * 1.45 + pingpong(plucks, delay=0.375, feedback=0.34) * 0.26 + wet_plucks * 0.5
        + mix.bus('hits') * 0.85 + wet_hits * 0.22
        + mix.bus('ui') * 0.9 + wet_ui * 0.15
        + mix.bus('air')
    )
    master = np.stack([signal.sosfilt(sos('highpass', 28), master[c]) for c in range(2)])
    master /= np.max(np.abs(master))
    master = np.tanh(master * 1.5) / np.tanh(1.5)
    master *= 10 ** (-1 / 20) / np.max(np.abs(master))
    end = int(duration * SR)
    fade = int(1.6 * SR)
    master[:, end - fade:end] *= np.linspace(1, 0, fade) ** 1.6
    return master[:, :end]


# ITU-R BS.1770 integrated loudness at 48 kHz (K-weighting, 400 ms blocks,
# absolute and relative gates), and true peak by 4x oversampling.
K_SHELF = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
K_HIGHPASS = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def loudness(x):
    z = signal.lfilter(*K_HIGHPASS, signal.lfilter(*K_SHELF, x, axis=1), axis=1)
    block, step = int(0.4 * SR), int(0.1 * SR)
    power = np.array([np.sum(np.mean(z[:, s:s + block] ** 2, axis=1)) for s in range(0, z.shape[1] - block + 1, step)])
    level = -0.691 + 10 * np.log10(power + 1e-20)
    gated = power[level > -70]
    relative = -0.691 + 10 * np.log10(np.mean(gated)) - 10
    return -0.691 + 10 * np.log10(np.mean(power[(level > -70) & (level > relative)]))


def true_peak(x):
    return 20 * np.log10(np.max(np.abs(signal.resample_poly(x, 4, 1, axis=1))) + 1e-12)


def main():
    cue_file, out = sys.argv[1], sys.argv[2]
    data = json.load(open(cue_file))
    audio = score(data['cues'], data['duration'])
    # Web and social delivery: -14 LUFS integrated, true peak below -1 dBTP.
    audio *= 10 ** ((-14 - loudness(audio)) / 20)
    peak = true_peak(audio)
    if peak > -1.2:
        audio *= 10 ** ((-1.2 - peak) / 20)
    wavfile.write(out, SR, audio.T.astype(np.float32))
    print(f'{out}: {audio.shape[1] / SR:.2f} s, {loudness(audio):.1f} LUFS integrated, true peak {true_peak(audio):.1f} dBTP')


if __name__ == '__main__':
    main()
