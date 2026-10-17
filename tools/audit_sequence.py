"""Flag back-to-back moves that load the same muscle group within a workout block.

  python tools/audit_sequence.py [workout-id]

Each exercise maps to its primary demands. Two consecutive moves (including the wrap from the
last move of a round back to the first) that share a demand are flagged, unless the pair is
listed in INTENTIONAL with the reason it helps.
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

G = {  # primary demands: grip, pull (lats/biceps), push (chest/triceps/front delts), overhead (shoulders),
       # hinge (hamstrings/glutes/low back), squat (quads), core, hipflex, plyo (impact/calves)
 'jumping-jacks': {'plyo'}, 'scap-pull-ups': {'grip', 'pull'}, 'kettlebell-halo': {'overhead', 'core'},
 'goblet-squat-pry': {'squat'}, 'dead-hang': {'grip'}, 'pull-ups': {'grip', 'pull'}, 'chin-ups': {'grip', 'pull'}, 'pull-ups-plus-negatives': {'grip', 'pull'}, 'chin-up-negatives': {'grip', 'pull'},
 'kettlebell-swings': {'hinge', 'grip'}, 'hanging-knee-raises': {'grip', 'core', 'hipflex'},
 'dips': {'push'}, 'dip-bar-knee-tucks': {'push', 'core', 'hipflex'}, 'kb-goblet-reverse-lunge': {'squat'},
 'kb-clean-and-press': {'overhead', 'push', 'hinge'}, 'burpees': {'push', 'plyo', 'squat'},
 'mountain-climbers': {'push', 'core', 'hipflex'}, 'squat-jumps': {'squat', 'plyo'}, 'push-ups': {'push'},
 'cool-down-stretches': set(),
 'kb-goblet-squat': {'squat'}, 'kb-dead-bug': {'core', 'hipflex'}, 'side-plank-hip-dips': {'core'}, 'russian-twists': {'core'},
 'single-leg-deadlifts': {'hinge'}, 'plank-kb-pull-through': {'core', 'push'}, 'kettlebell-glute-bridges': {'hinge'},
 'hollow-body-hold': {'core', 'hipflex'}, 'suitcase-deadlifts': {'hinge', 'grip', 'core'}, 'glute-bridge': {'hinge'}, 'bird-dog': {'core'},
 'high-knees': {'plyo', 'hipflex'},
}
CARDIO = {'plyo'}
INTENTIONAL = {  # (a, b): why the overlap is worth it
 ('chin-ups', 'push-ups'): 'antagonist superset, no shared muscle',
 ('chin-up-negatives', 'push-ups'): 'antagonist superset, no shared muscle',
 ('dead-hang', 'cool-down-stretches'): 'hang decompresses the spine after bar work',
}

def demands(it):
    return CARDIO if it['kind'] == 'cardio' else G.get(it.get('exId'), None)

def audit(w):
    issues = []
    for b in w['blocks']:
        items = b['items']; n = len(items)
        pairs = [(i, i + 1) for i in range(n - 1)]
        if (b.get('rounds') or 1) > 1 and n > 1 and not b.get('restAfterRound'):
            pairs.append((n - 1, 0))  # wrap into the next round with no rest between
        for i, j in pairs:
            a, c = items[i], items[j]
            da, dc = demands(a), demands(c)
            if da is None or dc is None: continue
            shared = (da & dc) - ({'plyo'} if a['kind'] == 'cardio' or c['kind'] == 'cardio' else set())
            key = (a.get('exId', 'cardio'), c.get('exId', 'cardio'))
            if shared and key not in INTENTIONAL and b['name'] not in ('Warm-up', 'Cool-down'):
                issues.append(f"{b['name']}: {key[0]} -> {key[1]} share {sorted(shared)}")
    return issues

if __name__ == '__main__':
    s = open(os.path.join(ROOT, 'js', 'seed.js'), encoding='utf-8').read()
    S = json.loads(s[s.index('{'):s.rindex('}') + 1])
    ws = [w for w in S['workouts'] if len(sys.argv) < 2 or w['id'] == sys.argv[1]]
    bad = 0
    for w in ws:
        iss = audit(w); bad += len(iss)
        print(w['name'] + (': OK' if not iss else ''))
        for x in iss: print('   ', x)
    sys.exit(1 if bad else 0)
