import os

def get_dir_size(path):
    total = 0
    try:
        for root, dirs, files in os.walk(path):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    total += os.path.getsize(fp)
                except:
                    pass
    except:
        pass
    return total / (1024 * 1024)

base = r"C:\Users\Kamila\.gemini\antigravity"
print(f"Base size: {get_dir_size(base):.2f} MB")
for item in os.listdir(base):
    p = os.path.join(base, item)
    if os.path.isdir(p):
        print(f"  {item}: {get_dir_size(p):.2f} MB")

cfg = r"C:\Users\Kamila\.gemini\config"
print(f"Config size: {get_dir_size(cfg):.2f} MB")

vid = r"C:\Users\Kamila\Documents\video"
print(f"Video folder size: {get_dir_size(vid):.2f} MB")
