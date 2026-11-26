"""Shows which drawing files the explorer is built from, and warns when a newer drawing file sits in the same folder.

Usage: python3 explorer/check_drawings.py path/to/explorer.json. It changes nothing. Exit code 0 = nothing to warn about, 2 = a newer file was found.
"""
import datetime, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import extract as X  # noqa: E402

X.configure(sys.argv[1] if len(sys.argv) > 1 else "explorer.json")


def stamp(path):
    return datetime.datetime.fromtimestamp(os.path.getmtime(path)).strftime("%d %b %Y, %H:%M")


warn = []
print("  The explorer is built from these drawings:")
for wf_id, name, _desc, path in X.WORKFLOWS:
    if not os.path.exists(path):
        print("    MISSING  %s: %s" % (name, os.path.basename(path)))
        warn.append(path)
        continue
    print("    %-20s %s   (saved %s)" % (name, os.path.basename(path), stamp(path)))
    folder = os.path.dirname(path)
    mine = os.path.getmtime(path)
    for f in sorted(os.listdir(folder)):
        full = os.path.join(folder, f)
        if f.lower().endswith(".drawio") and full != path and os.path.isfile(full) and os.path.getmtime(full) > mine:
            warn.append(full)
            print("      NOTE: a newer file is in the same folder: %s (saved %s)" % (f, stamp(full)))

if warn:
    print()
    print("  If the newer file is the one that should be shown, stop here (close this window) and ask Claude")
    print("  to point the explorer at it. A new file name has to be set once in extract.py.")
    sys.exit(2)
