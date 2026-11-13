import io, sys, json
def patch(path, pairs):
    s = io.open(path, encoding="utf-8-sig").read()
    for a, b in pairs:
        if a not in s:
            print("MISS in", path.split("\\")[-1], ":", a[:80])
        s = s.replace(a, b)
    io.open(path, "w", encoding="utf-8", newline="\n").write(s)
if __name__ == "__main__":
    R = "C:\\AI_Work\\Foxconn 3D\\src\\"
    spec = json.load(io.open(sys.argv[1], encoding="utf-8-sig"))
    for f, pairs in spec.items():
        patch(R + f, pairs)
    print("patched", {k: len(v) for k, v in spec.items()})

