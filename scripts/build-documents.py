"""Build Word copies from the reviewed Markdown course deliverables.
Run with the bundled Codex document Python runtime.
"""
from pathlib import Path
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
FIGS = DOCS / 'figures'
FIGS.mkdir(exist_ok=True)
FONT = 'C:/Windows/Fonts/arial.ttf'
BOLD = 'C:/Windows/Fonts/arialbd.ttf'

def diagram(name, title, columns, links=None):
    width, height = 1600, 900
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((45, 25), title, font=ImageFont.truetype(BOLD, 34), fill='#173b2e')
    count = len(columns)
    cell = (width-80)/count
    positions = {}
    for col, (heading, nodes) in enumerate(columns):
        x = int(40+col*cell)
        draw.rounded_rectangle((x, 95, x+cell-20, height-35), radius=18, fill='#f2f6f1', outline='#d5dfd5', width=2)
        draw.text((x+18, 116), heading, font=ImageFont.truetype(BOLD, 24), fill='#173b2e')
        for row, (key, label) in enumerate(nodes):
            y = 205+row*145
            cx = int(x+cell/2-10)
            positions[key] = (cx, y+42)
            draw.rounded_rectangle((x+20,y,x+cell-40,y+90), radius=12, fill='white', outline='#285b48', width=3)
            words = label.split(); lines=[]; line=''
            maxchars = max(15, int((cell-75)/13))
            for word in words:
                if len(line+' '+word)>maxchars and line: lines.append(line); line=word
                else: line=(line+' '+word).strip()
            lines.append(line)
            for i, text in enumerate(lines):
                box = draw.textbbox((0,0),text,font=ImageFont.truetype(FONT,23))
                draw.text((cx-(box[2]-box[0])/2,y+15+i*27),text,font=ImageFont.truetype(FONT,23),fill='#173b2e')
    # Actor and data figures use explicit relation lists below the figure in the source.
    if links:
        for a,b in links:
            ax,ay=positions[a]; bx,by=positions[b]
            if ax==bx:
                draw.line((ax,ay+48,bx,by-48), fill='#53755f',width=3)
                draw.polygon(((bx,by-48),(bx-7,by-61),(bx+7,by-61)),fill='#53755f')
    image.save(FIGS / (name+'.png'))

diagram('architecture','CampusFix system structure',[
 ('Client',[('browser','Browser or installed PWA'),('draft','Local drafts and queue')]),
 ('Application',[('next','Next.js pages and API'),('auth','Session and role checks'),('service','Ticket services and Drizzle')]),
 ('Data',[('pg','Neon PostgreSQL or local PostgreSQL'),('blob','Private Blob or private local files')]),
 ('Background work',[('job','Durable database jobs'),('workflow','Vercel Workflow or local worker')])], [('next','auth'),('auth','service'),('job','workflow')])
diagram('usecases','CampusFix users and tasks',[
 ('Reporter',[('r1','Report a fault'),('r2','Follow and comment'),('r3','Confirm or dispute')]),
 ('Dispatcher',[('d1','Set priority'),('d2','Assign technician'),('d3','Merge and report')]),
 ('Technician',[('t1','Start assigned work'),('t2','Record parts and time'),('t3','Submit repair proof')]),
 ('Administrator',[('a1','Manage accounts'),('a2','Set reference data'),('a3','Review audit history')])])
diagram('entities','CampusFix data relationships',[
 ('People',[('u','User and session'),('t','Technician profile'),('s','Ticket subscriber')]),
 ('Core records',[('c','Category and location'),('k','Ticket'),('p','Optional main ticket')]),
 ('Ticket detail',[('w','Work log and comment'),('f','Private attachment'),('a','Audit event')]),
 ('Deferred work',[('n','User notification'),('d','Test delivery'),('j','Background job')])], [('n','d')])
diagram('swimlanes','CampusFix repair responsibilities',[
 ('Reporter',[('r1','Submit report'),('r2','Track progress'),('r3','Review repair'),('r4','Confirm or dispute')]),
 ('Facilities',[('d1','Review priority'),('d2','Assign qualified technician')]),
 ('Technician',[('t1','Start work'),('t2','Record repair'),('t3','Upload proof'),('t4','Complete repair')]),
 ('System',[('s1','Store audit and notices'),('s2','Check ticket version'),('s3','Close after 72 hours if undisputed')])], [('r1','r2'),('r2','r3'),('r3','r4'),('d1','d2'),('t1','t2'),('t2','t3'),('t3','t4')])

def clean(s):
    s=re.sub(r'\[([^]]+)\]\(([^)]+)\)',r'\1 (\2)',s)
    return s.replace('**','').replace('`','')

def rich(p, text):
    for token in re.split(r'(\*\*.*?\*\*|`[^`]+`|\[[^]]+\]\([^)]+\))',text):
        if not token: continue
        r=p.add_run(clean(token))
        if token.startswith('**'): r.bold=True
        if token.startswith('`'): r.font.name='Consolas'; r.font.size=Pt(9)

def shade(cell, fill):
    prop=cell._tc.get_or_add_tcPr(); node=OxmlElement('w:shd'); node.set(qn('w:fill'),fill);prop.append(node)

def make_table(doc, raw):
    values=[[clean(x.strip()) for x in line.strip().strip('|').split('|')]for line in raw]
    values=[v for v in values if not all(re.fullmatch(r'[:\- ]+',x or '-')for x in v)]
    cols=max(map(len,values));table=doc.add_table(rows=0,cols=cols)
    table.style='Table Grid';table.autofit=True
    for index, vals in enumerate(values):
        cells=table.add_row().cells
        prop=table.rows[-1]._tr.get_or_add_trPr(); prop.append(OxmlElement('w:cantSplit'))
        if index==0:
            prop.append(OxmlElement('w:tblHeader'))
        for i,cell in enumerate(cells):
            cell.text=vals[i] if i<len(vals) else ''
            for p in cell.paragraphs:
                p.paragraph_format.space_after=Pt(5);p.paragraph_format.space_before=Pt(5)
                for r in p.runs:
                    r.font.size=Pt(9)
                    if index==0:r.bold=True;r.font.color.rgb=RGBColor(255,255,255)
            shade(cell,'173B2E' if index==0 else ('F0F4EF' if index%2==0 else 'FFFFFF'))
    doc.add_paragraph().paragraph_format.space_after=Pt(0)

def picture(doc, file, alt):
    if not file.exists(): return
    w,h=Image.open(file).size
    width=min(6.75,6.5*w/h)
    p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next=True
    p.add_run().add_picture(str(file),width=Inches(width))
    cap=doc.add_paragraph(alt,style='Caption');cap.alignment=WD_ALIGN_PARAGRAPH.CENTER

def build(stem):
    doc=Document();section=doc.sections[0]
    section.top_margin=section.bottom_margin=Inches(.75)
    section.left_margin=section.right_margin=Inches(.75)
    section.page_width=Inches(8.5);section.page_height=Inches(11)
    normal=doc.styles['Normal'];normal.font.name='Arial';normal.font.size=Pt(10.5)
    normal.paragraph_format.space_after=Pt(7);normal.paragraph_format.line_spacing=1.08
    for name,size in [('Title',27),('Heading 1',16),('Heading 2',13),('Heading 3',11)]:
        st=doc.styles[name];st.font.name='Arial';st.font.size=Pt(size);st.font.color.rgb=RGBColor(0,0,0)
        st.paragraph_format.keep_with_next=True
    for style in doc.styles:
        for border in list(style.element.iter(qn('w:pBdr'))):
            border.getparent().remove(border)
    caption=doc.styles['Caption'];caption.font.color.rgb=RGBColor.from_string('41614B');caption.font.size=Pt(9);caption.font.bold=False
    header=section.header.paragraphs[0];header.text='CAMPUSFIX  |  CIT4001 COURSE DEMONSTRATION'
    for r in header.runs:r.font.size=Pt(8);r.font.color.rgb=RGBColor.from_string('41614B')
    foot=section.footer.paragraphs[0];foot.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    foot.add_run('CampusFix  |  ')
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');foot._p.append(field)
    lines=(DOCS/(stem+'.md')).read_text(encoding='utf8').splitlines()
    i=0;fig=0
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line.startswith('```'):
            lang=line[3:];code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            if lang=='mermaid':
                joined='\n'.join(code)
                kind='erd' if 'erDiagram' in joined else ('class' if 'classDiagram' in joined else ('swimlanes' if 'subgraph Reporter' in joined else ('usecases' if 'Submit([Report fault])' in joined else 'architecture')))
                file=FIGS/(kind+'-mermaid.png')
                if not file.exists():file=FIGS/(('entities' if kind in ['erd','class'] else kind)+'.png')
                picture(doc,file,f'Figure {fig+1} {kind.replace("usecases","users and tasks")}')
                fig+=1
                doc.add_paragraph('The companion Markdown file contains the editable diagram and exact relationships.')
            else:
                for x in code:
                    p=doc.add_paragraph();p.paragraph_format.space_after=Pt(1)
                    r=p.add_run(x);r.font.name='Consolas';r.font.size=Pt(8)
            i+=1;continue
        if line.startswith('|'):
            raw=[]
            while i<len(lines) and lines[i].strip().startswith('|'):raw.append(lines[i]);i+=1
            make_table(doc,raw);continue
        match=re.fullmatch(r'!\[([^]]*)\]\(([^)]+)\)',line)
        if match:
            picture(doc,DOCS/match[2],match[1]);i+=1;continue
        if line.startswith('#'):
            level=len(line)-len(line.lstrip('#'));title=re.sub(r'[^\w ]','',line.lstrip('#').strip())
            doc.add_paragraph(title,style='Title' if level==1 else f'Heading {min(level-1,3)}')
            i+=1;continue
        if line.startswith('- ') or re.match(r'^\d+\. ',line):
            numbered=bool(re.match(r'^\d+\. ',line))
            p=doc.add_paragraph(style='Normal' if numbered else 'List Bullet')
            if numbered:
                p.paragraph_format.left_indent=Inches(.2);p.paragraph_format.first_line_indent=Inches(-.2)
                p.paragraph_format.space_after=Pt(0);p.paragraph_format.space_before=Pt(0)
            rich(p,line if numbered else line[2:]);i+=1;continue
        paragraph=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|!\[|- |\d+\. )',lines[i]):paragraph.append(lines[i].strip());i+=1
        rich(doc.add_paragraph(),' '.join(paragraph))
    doc.core_properties.title=lines[0].lstrip('# ').strip()
    doc.core_properties.subject='CIT4001 implementation and testing evidence'
    doc.core_properties.author='CampusFix project group'
    out=DOCS/'word';out.mkdir(exist_ok=True)
    doc.save(out/(stem+'.docx'))
    print('Created',stem+'.docx')

for stem in ['CampusFix_Software_Implementation_Report','CampusFix_Programme_Manual','CampusFix_User_Manual']:
    build(stem)
