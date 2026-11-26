#!/usr/bin/env python3
"""Original score for the 67 walkthrough (version 2), synthesized from the film's cues.

The showreel's night-garage groove at 120 BPM in F minor, cut to the
interface: a broken two-step kick, snare and clap on two and four, swung
hats and a shaker, a bouncing sub bass, a sung chord hook, a warm pad. The
four-bar loop (F minor, D flat, A flat, E flat) turns every two seconds, on
the film's cuts. The hook rests where the picture slows (the chart, the
claim), the drums fall away on gno.land and come back for the robot; the end
card is a long sung chord. The interface is heard as soft low taps (a press,
the keystroke, each line of the robot's log) and a warm two-note figure on
each confirmation; nothing high or beeping (owner: "пиликалки не очень прям
пищит"). Nothing is sampled or licensed.

    python3 reel/walk/music.py reel/walk/cues.json reel/walk/record.json out.wav
"""
import json
import os
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from music import (SR, STEP, OH, HOOK, VOICE, BASS_ROOT, Mix, pad, vox, stab, sub, bass, deep_kick, snare,  # noqa: E402
                   clap, hat, shaker, rim, crash, boom, riser, pluck, whoosh, air, impulse,
                   convolve, pingpong, lowpass_sweep, sos, swung, loudness, true_peak)

LOOP = ['Fm', 'Db', 'Ab', 'Eb']
GROOVE = (2, 36)          # full drums
BREAK = (36, 42)          # gno.land: no drums, filters closing then a riser
ROBOT = (42, 47)          # the drums come back
HOOK_REST = [(10, 14), (26, 30)]


def chord_at(at):
    return LOOP[int(at // 2) % 4]


def soft_tap(weight=1.0):
    """A felt tap: a low thump and a short, dark breath of noise, nothing above 1.6 kHz."""
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * np.cumsum(150 + 90 * np.exp(-t / 0.01)) / SR) * np.exp(-t / 0.03)
    breath = signal.sosfilt(sos('bandpass', [300, 1600]), np.random.default_rng(7).standard_normal(n)) * np.exp(-t / 0.012) * 0.5
    x = (thump * weight + breath) * np.minimum(1, t / 0.001)
    return signal.sosfilt(sos('lowpass', 1800), x)


def inside(at, spans):
    return any(a <= at < b for a, b in spans)


def score(cues, duration):
    mix = Mix(duration + 1)
    kinds = {}
    for cue in cues:
        kinds.setdefault(cue['kind'], []).append(cue['t'])
    bars = int(np.ceil(duration / 2))

    # Pad all the way; brighter in the groove, open on the end card.
    for k in range(bars):
        at = 2.0 * k
        chord = chord_at(at)
        cutoff = 900 if at < 2 or inside(at, [BREAK]) else (1500 if at < 47 else 1100)
        gain = 0.42 if inside(at, [GROOVE, ROBOT]) else 0.62
        mix.add('pad', at, pad(VOICE[chord], 2.0, cutoff=cutoff, attack=0.35), gain=gain)
    mix.add('air', 0, air(duration + 1), gain=0.035)

    # Drums.
    kicks = []
    for k in range(bars):
        at = 2.0 * k
        if at < 2:
            # The first bar: kick on one, hats on the off-beats, a snare roll into the groove.
            mix.add('drums', at, deep_kick(), gain=0.55)
            kicks.append(at)
            for step in (2, 6, 10, 14):
                mix.add('drums', at + swung(step), hat(), pan=0.2, gain=0.3)
            for n in range(8):
                mix.add('drums', at + 1.0 + n * STEP, snare(), gain=0.05 + 0.28 * (n / 7) ** 2)
            continue
        if not inside(at, [GROOVE, ROBOT]):
            continue
        for step in (0, 10):
            mix.add('drums', at + step * STEP, deep_kick(), gain=0.55)
            kicks.append(at + step * STEP)
        if k % 2 == 1:
            mix.add('drums', at + 15 * STEP, deep_kick(0.3), gain=0.22)
        for step in (4, 12):
            mix.add('drums', at + step * STEP, snare(), pan=0.04, gain=0.6)
            mix.add('drums', at + step * STEP + 0.008, clap(), pan=-0.04, gain=0.22)
        for step in range(16):
            when = at + swung(step)
            mix.add('drums', when, hat(), pan=0.2, gain=0.26 * (0.32, 0.12, 0.55, 0.14)[step % 4] / 0.55)
            if step % 2 == 1:
                mix.add('drums', when, shaker(), pan=-0.25, gain=0.07)
        for step in (6, 14):
            mix.add('drums', at + swung(step), hat(True), pan=-0.18, gain=0.09)
        if k % 2 == 0:
            mix.add('drums', at + 7 * STEP, rim(), pan=0.3, gain=0.12)
    for at in (2, 14, 30, 42):
        mix.add('drums', at, crash(), gain=0.13)
    # A roll into the robot.
    for n in range(16):
        mix.add('drums', 40 + n * STEP, snare(), gain=0.04 + 0.3 * (n / 15) ** 2)

    # Bass: the bouncing line in the groove, long notes in the break and at the end.
    for k in range(bars):
        at = 2.0 * k
        root = BASS_ROOT[chord_at(at)]
        if inside(at, [GROOVE, ROBOT]):
            for step, interval, length in ((0, 0, 0.32), (3, 12, 0.12), (6, 0, 0.2), (10, 7, 0.2), (13, 12, 0.12)):
                note = root + interval
                mix.add('bass', at + swung(step), sub(note, length, 1.2), gain=0.24)
                mix.add('bass', at + swung(step), bass(note + 12, length, 700), gain=0.45)
        elif at < 2 or inside(at, [BREAK]) or at >= 47:
            mix.add('bass', at, sub(root, 1.9, 1.2), gain=0.3 if at < 50 else 0.2)

    # Sidechain: pad and voices breathe with the kick.
    t = np.arange(mix.n) / SR
    duck = np.ones(mix.n)
    for at in kicks:
        s0, e0 = int(at * SR), min(mix.n, int((at + 0.32) * SR))
        duck[s0:e0] = np.minimum(duck[s0:e0], 1 - 0.5 * np.exp(-(t[s0:e0] - at) / 0.085))

    # The hook: sung stabs over two-bar phrases, resting on the slower moments.
    for start in range(2, 42, 4):
        for step, top in HOOK:
            when = start + swung(step % 16) + (2.0 if step >= 16 else 0.0)
            if inside(when, HOOK_REST) or not inside(when, [GROOVE]):
                continue
            mix.add('vox', when, vox(stab(chord_at(when), top), 0.16, OH, bright=0.6), pan=-0.2 if step % 2 else 0.2, gain=0.9)
    for start in (42, 44):
        for step, top in HOOK[:4]:
            when = start + swung(step)
            mix.add('vox', when, vox(stab(chord_at(when), top), 0.16, OH, bright=0.6), pan=0.15, gain=0.65)
    # Long sung chords: the opening, the break, the end card.
    for at, top, length in ((0, 72, 1.8), (36, 77, 1.8), (38, 72, 1.8), (47, 77, 1.8), (49, 72, 2.4)):
        mix.add('vox', at, vox(stab(chord_at(at), top, 4), length, OH, release=0.7, bright=0.8), gain=0.75)
    for name in ('pad', 'vox'):
        mix.bus(name)[:] *= duck

    # The break closes its filters, then a riser lifts into the robot.
    for name in ('pad', 'vox'):
        lowpass_sweep(mix.bus(name), 36, 40, 9000, 700)
    mix.add('hits', 39.6, riser(2.4), gain=0.24)
    for at, gain in ((2, 0.5), (14, 0.45), (30, 0.4), (42, 0.7), (47, 0.55)):
        mix.add('hits', at, boom(), gain=gain)
    mix.bus('hits')[:] = np.stack([signal.sosfilt(sos('highpass', 24), mix.bus('hits')[c]) for c in range(2)])

    # The interface.
    def bar_note(at, note, pan, gain, bright=1.0, length=1.6):
        mix.add('pluck', at, pluck(note, bright, length), pan=pan, gain=gain)
    for at in kinds.get('press', []):
        mix.add('ui', at, soft_tap(), pan=0.1, gain=0.42)
    for at in kinds.get('key', []):
        mix.add('ui', at, soft_tap(0.6), pan=0.1, gain=0.3)
    for at in kinds.get('confirmed', []):
        # Two warm, low notes of the chord, a fifth apart.
        root = VOICE[chord_at(at)][0]
        bar_note(at, root, 0.1, 0.32, 0.25, 1.4)
        bar_note(at + STEP, root + 7, 0.2, 0.26, 0.25, 1.4)
    for at in kinds.get('cut', []):
        mix.add('ui', at - 0.16, whoosh(0.4), pan=-0.1, gain=0.03)
    for at in kinds.get('line', []):
        mix.add('ui', at, soft_tap(0.8), pan=0.15, gain=0.32)
    for at in kinds.get('end', []):
        for k, note in enumerate((53, 60, 65, 68)):
            bar_note(at + 0.05 * k, note, -0.3 + 0.2 * k, 0.24, 0.3, 3.0)
    bar_note(duration - 2.2, 41, 0, 0.4, 0.4, 2.2)

    # Space and master.
    long_room = impulse(2.8, 5600, 3)
    short_room = impulse(0.8, 7000, 4)
    plucks = mix.bus('pluck')
    master = (
        mix.bus('drums') + convolve(mix.bus('drums'), short_room) * 0.1
        + mix.bus('bass')
        + mix.bus('pad') + convolve(mix.bus('pad'), long_room) * 0.35
        + mix.bus('vox') * 0.9 + convolve(mix.bus('vox'), long_room) * 0.3
        + plucks * 1.3 + pingpong(plucks, delay=0.375, feedback=0.34) * 0.25 + convolve(plucks, long_room) * 0.45
        + mix.bus('hits') * 0.85 + convolve(mix.bus('hits'), long_room) * 0.2
        + mix.bus('ui') + convolve(mix.bus('ui'), short_room) * 0.15
        + mix.bus('air')
    )
    master = np.stack([signal.sosfilt(sos('highpass', 28), master[c]) for c in range(2)])
    # A gentle shelf above 5 kHz and nothing above 13 kHz: no edge on small speakers.
    top = np.stack([signal.sosfilt(sos('highpass', 5000), master[c]) for c in range(2)])
    master = master - 0.35 * top
    master = np.stack([signal.sosfilt(sos('lowpass', 13000), master[c]) for c in range(2)])
    master /= np.max(np.abs(master))
    master = np.tanh(master * 1.5) / np.tanh(1.5)
    end = int(duration * SR)
    master = master[:, :end]
    fade = int(1.4 * SR)
    master[:, end - fade:] *= np.linspace(1, 0, fade) ** 1.6
    return master


def main():
    cue_file, record_file, out = sys.argv[1], sys.argv[2], sys.argv[3]
    film = json.load(open(cue_file))
    record = json.load(open(record_file))
    cues = film['cues'] + record['cues']
    audio = score(cues, film['duration'])
    audio *= 10 ** ((-14 - loudness(audio)) / 20)
    peak = true_peak(audio)
    if peak > -1.2:
        audio *= 10 ** ((-1.2 - peak) / 20)
    wavfile.write(out, SR, audio.T.astype(np.float32))
    print(f'{out}: {audio.shape[1] / SR:.2f} s, {loudness(audio):.1f} LUFS integrated, true peak {true_peak(audio):.1f} dBTP')


if __name__ == '__main__':
    main()
