"""Concatenate apps-script/src into apps-script/dist/cma.js, the file Loader.gs loads."""
import glob, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
parts = [open(p, encoding="utf-8").read() for p in sorted(glob.glob(os.path.join(root, "apps-script/src/*.js")))]
os.makedirs(os.path.join(root, "apps-script/dist"), exist_ok=True)
with open(os.path.join(root, "apps-script/dist/cma.js"), "w", encoding="utf-8") as f:
    f.write("/* Built from apps-script/src by build/build_bundle.py. Edit the source files, not this one. */\n(function () {\n")
    f.write("\n".join(parts))
    f.write("\n})();\n")
print("built", sum(len(p) for p in parts), "chars")
