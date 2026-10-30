"""Rasterise Word-exported PDFs for page-by-page visual review."""
from pathlib import Path
import json
import pypdfium2 as pdfium
from PIL import Image, ImageOps, ImageDraw
root=Path(__file__).resolve().parents[1]/'.data'/'document-qa'
evidence=[]
for file in root.glob('*.pdf'):
    pdf=pdfium.PdfDocument(file)
    folder=root/file.stem;folder.mkdir(exist_ok=True)
    thumbs=[]
    for i,page in enumerate(pdf):
        image=page.render(scale=1.5).to_pil().convert('RGB')
        image.save(folder/f'page-{i+1}.png')
        thumb=ImageOps.contain(image,(306,396))
        tile=Image.new('RGB',(326,426),'#e6eae6');tile.paste(thumb,((326-thumb.width)//2,15))
        ImageDraw.Draw(tile).text((12,410),f'Page {i+1}',fill='black')
        thumbs.append(tile)
    for start in range(0,len(thumbs),12):
        subset=thumbs[start:start+12];rows=(len(subset)+2)//3
        sheet=Image.new('RGB',(978,426*rows),'white')
        for j,tile in enumerate(subset):sheet.paste(tile,((j%3)*326,(j//3)*426))
        sheet.save(folder/f'montage-{start//12+1}.png')
    evidence.append({'document':file.stem+'.docx','pages':len(pdf),'renderer':'Microsoft Word PDF export and pypdfium2','review':'Page PNGs created for visual review'})
    print(file.stem,len(pdf),'pages')
(root/'manifest.json').write_text(json.dumps(evidence,indent=2))
