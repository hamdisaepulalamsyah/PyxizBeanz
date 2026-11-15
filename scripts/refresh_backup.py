import os
import zipfile

def update_core_sessions():
    antigravity_zip = r"C:\Users\Kamila\Desktop\Antigravity_Backup\1_Antigravity_Sessions_and_Memories.zip"
    print("Updating 1_Antigravity_Sessions_and_Memories.zip with latest chat & brain logs...")
    base = r"C:\Users\Kamila\.gemini"
    
    with zipfile.ZipFile(antigravity_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
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
    print(f"Updated core backup size: {os.path.getsize(antigravity_zip) / (1024*1024):.2f} MB")

update_core_sessions()
