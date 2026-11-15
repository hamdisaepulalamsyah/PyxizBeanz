import os
import zipfile

def zip_folder(source_dir, output_zip, exclude_dirs=[], exclude_exts=[]):
    print(f"Creating {output_zip}...")
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, dirs, files in os.walk(source_dir):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for file in files:
                if any(file.endswith(ext) for ext in exclude_exts):
                    continue
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, os.path.dirname(source_dir))
                try:
                    zf.write(file_path, rel_path)
                except Exception as e:
                    print(f"Skipping {file_path}: {e}")
    print(f"Finished {output_zip} ({os.path.getsize(output_zip) / (1024*1024):.2f} MB)")

os.makedirs(r"C:\Users\Kamila\Desktop\Antigravity_Backup", exist_ok=True)

# 1. Antigravity Sessions & Memories (brain, conversations, config)
print("1. Packaging Antigravity Core Sessions...")
antigravity_zip = r"C:\Users\Kamila\Desktop\Antigravity_Backup\1_Antigravity_Sessions_and_Memories.zip"
with zipfile.ZipFile(antigravity_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    base = r"C:\Users\Kamila\.gemini"
    for folder in ['antigravity', 'config']:
        fpath = os.path.join(base, folder)
        for root, dirs, files in os.walk(fpath):
            dirs[:] = [d for d in dirs if d not in ['cache', 'crashes', 'scratch']]
            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, base)
                try:
                    zf.write(file_path, rel_path)
                except:
                    pass
print(f"Antigravity Core Backup ready: {os.path.getsize(antigravity_zip) / (1024*1024):.2f} MB")

# 2. Video Projects & Workspaces
print("2. Packaging Projects (excl node_modules)...")
proj_zip = r"C:\Users\Kamila\Desktop\Antigravity_Backup\2_Proyek_Video_Semua.zip"
zip_folder(r"C:\Users\Kamila\Documents\video", proj_zip, exclude_dirs=['node_modules', '.remotion', 'out'])
