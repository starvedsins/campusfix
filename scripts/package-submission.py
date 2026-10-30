"""Create a portable source and evidence package without local data or secrets."""
from pathlib import Path
import os
import zipfile
import hashlib
import json
root=Path(__file__).resolve().parents[1]
output=root.parent/'CampusFix_Course_Submission_2026-10-30.zip'
skip_dirs={'node_modules','.data','.git','.next','.vercel','.workflow-data','.agents','.playwright-mcp','test-results','playwright-report','introspection','__pycache__'}
files=[]
for current,dirs,names in os.walk(root):
    dirs[:]=[x for x in dirs if x not in skip_dirs and not (x=='.well-known' and Path(current).name=='app')]
    for name in names:
        if name.startswith('.env') and name!='.env.example':continue
        if name.endswith('.tsbuildinfo') or name.endswith('.log') or name=='skills-lock.json':continue
        file=Path(current)/name
        if file.relative_to(root).as_posix()=='docs/evidence/submission-package.json':continue
        files.append(file)
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as archive:
    for file in files:archive.write(file,Path('campusfix')/file.relative_to(root))
with zipfile.ZipFile(output)as archive:
    bad=[x for x in archive.namelist()if '/.data/'in x or '/node_modules/'in x or (Path(x).name.startswith('.env')and Path(x).name!='.env.example')]
    if bad:raise RuntimeError('Private files were found in the package')
    if archive.testzip():raise RuntimeError('The package failed its CRC check')
manifest={'createdAt':'2026-10-30','archive':output.name,'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'privateDataIncluded':False,'dependenciesIncluded':False,'setup':'Extract campusfix, run npm ci, then npm run local. See README.md.'}
(root/'docs'/'evidence'/'submission-package.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
